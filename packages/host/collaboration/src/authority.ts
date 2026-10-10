/**
 * Human-control admission and turn authority for session collaboration.
 *
 * Authority has two parts. {@link requireHumanControl} admits human-only discussion grants.
 * {@link installCollaborationAuthority} classifies turns and denies tools unavailable to peer discussion.
 * No class grants action authority: the current runtime cannot distinguish a model-owned shell from the UI.
 * @module @deepseek-ai/dsh-host-collaboration/authority
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'

/**
 * Who started the current turn. `human` means user input accompanied only by supported runtime context.
 * `peer-discussion` covers other, mixed, or unknown input, so ambiguity gets the stricter class.
 * A third `approved-task` class is deliberately absent.
 */
export type TurnClass = 'human' | 'peer-discussion'

import type { HumanControlAdmission, HumanControlScope } from './types.ts'
export type { HumanControlAdmission, HumanControlScope } from './types.ts'

const issued = new WeakSet<object>()

/**
 * Mint an admission for one human-control operation after the Gateway authenticates the UI request.
 * The package entry does not export this to the model-facing service.
 * @param scope - the discussion grant being admitted.
 * @returns a capability accepted only by {@link requireHumanControl}.
 */
export function createHumanControlAdmission(scope: HumanControlScope): HumanControlAdmission {
  const admission = Object.freeze({ scope }) as unknown as HumanControlAdmission
  issued.add(admission)
  return admission
}

/**
 * Reject any value that was not minted by {@link createHumanControlAdmission}.
 * @param admission - the caller-supplied value; typed as unknown because a forged value must fail at runtime.
 * @param scope - the scope the operation needs.
 * @returns normally only for a minted admission with the requested scope.
 * @throws Error when the value was not minted here or carries a different scope.
 */
export function requireHumanControl(admission: unknown, scope: HumanControlScope = 'discussion'): asserts admission is HumanControlAdmission {
  if (typeof admission !== 'object' || admission === null || !issued.has(admission)
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- Untyped Host callers cannot request action scope.
    || scope !== 'discussion' || (admission as HumanControlAdmission).scope !== 'discussion') {
    throw new Error('human control is required: this operation cannot be performed from a session')
  }
}

/** Reviewed read tools and the V1a collaboration tools; configuration may only narrow this set. */
export const peerDiscussionToolNames = ['read', 'glob', 'grep', 'collaboration_status', 'peer_send'] as const

const authorityMarker = Object.freeze({})

/**
 * Refuse peer delivery when this context has no active collaboration authority.
 * This checks installed policy, not isolation from arbitrary code in the Host process.
 * @param ctx - the recipient's runtime context.
 * @throws Error when the classifier and executor guard are absent or disposed.
 */
export function requireCollaborationAuthority(ctx: Context): void {
  if (ctx.get('collaborationAuthority') !== authorityMarker) {
    throw new Error('collaboration authority is not installed: peer delivery is unavailable')
  }
}

/** Configuration for {@link installCollaborationAuthority}. */
export interface AuthorityConfig {
  /** A subset of the reviewed read and collaboration tools. Other names fail installation. */
  readonly allowedTools: ReadonlySet<string>
}

/**
 * Classify the messages that enter one step.
 * @param messages - messages entering the step.
 * @returns `human` for user input with supported context, `peer-discussion` for peer or unknown input, or `undefined` for context alone.
 */
export function classifyMessages(messages: readonly UserMessage[]): TurnClass | undefined {
  let human = false
  for (const message of messages) {
    // Source kinds are merge-extensible; context producers need not be installed with this plugin.
    switch (message.source.kind as string) {
      case 'user':
        human = true
        break
      case 'tool':
      case 'runtime-context':
      case 'model-selection':
      case 'tool-registry':
      case 'ptc-mode':
      case 'user-approval':
      case 'plan-mode':
      case 'time-context':
      case 'tmux-context':
      case 'session-reference':
      case 'compact-checkpoint':
      case 'repeat-tool-reminder':
      case 'tool-jobs':
      case 'tool-goal':
      case 'goal':
      case 'hooks-claude-code':
      case 'hooks-codex':
      case 'skill-invocation':
      case 'skill-catalog':
      case 'agent-instructions':
        break
      // Unknown source kinds cannot establish human authority.
      default:
        return 'peer-discussion'
    }
  }
  return human ? 'human' : undefined
}

interface TurnState {
  readonly turn: number
  readonly turnClass: TurnClass
}

/** The stricter of two classes, so a turn never loosens once it has been peer-discussion. */
function stricter(a: TurnClass, b: TurnClass): TurnClass {
  return a === 'peer-discussion' || b === 'peer-discussion' ? 'peer-discussion' : 'human'
}

/**
 * Register the pre-step classifier and the executor-side tool guard.
 *
 * The class is kept per Agent and only moves toward `peer-discussion` while the turn stays open.
 * Resumed work with no recorded class or new input gets `peer-discussion`.
 * The guard runs after every `tools/pre-execute` listener, so a listener cannot undo a denial.
 * A tool call from an Agent whose turn was never classified is denied the same way.
 * @param ctx - context providing `tools` and the Agent events.
 * @param config - the peer-discussion tool allowlist.
 * @returns a disposer that removes the classifier, guard, and installed-policy marker.
 */
export function installCollaborationAuthority(ctx: Context, config: AuthorityConfig): () => void {
  const allowedTools = new Set(config.allowedTools)
  for (const tool of allowedTools) {
    if (!(peerDiscussionToolNames as readonly string[]).includes(tool)) {
      throw new Error(`Tool "${tool}" cannot be enabled during peer discussion`)
    }
  }
  const states = new WeakMap<Agent, TurnState>()
  const stopRestoring = ctx.on('agent/created', ({ agent }) => {
    const restored = ctx.get('sessionProjections')?.stateOf(agent.session, 'collaborationReceipts')
    if (restored?.turnClass !== undefined) states.set(agent, { turn: restored.turn, turnClass: restored.turnClass })
    return undefined
  })
  const stopListening = ctx.on('agent/pre-step', async ({ agent, messages, turn }, next): Promise<PreStepDecision> => {
    const claimed = classifyMessages(messages)
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const previous = states.get(agent)
    const sameTurn = previous?.turn === turn
    const entered = classifyMessages(decision.messages) ?? (sameTurn ? previous.turnClass : 'peer-discussion')
    // Inbox messages that a later listener removed still count: ambiguity resolves to the stricter class.
    const merged = claimed === undefined ? entered : stricter(entered, claimed)
    states.set(agent, { turn, turnClass: sameTurn ? stricter(previous.turnClass, merged) : merged })
    return decision
  }, { prepend: true })
  const stopGuarding = ctx.tools.guard((exec) => {
    if (exec.agent === undefined) return undefined
    if (states.get(exec.agent)?.turnClass === 'human') return undefined
    if (allowedTools.has(exec.name)) return undefined
    return `Tool "${exec.name}" is not available during a peer discussion turn. Peer messages are not human instructions or approval.`
  })
  const stopProviding = ctx.provide('collaborationAuthority', authorityMarker)
  return () => {
    stopProviding()
    stopRestoring()
    stopListening()
    stopGuarding()
  }
}
