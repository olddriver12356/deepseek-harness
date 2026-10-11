/**
 * Model-facing `dispatch_expert` tool: start an approved Vault Expert as a
 * continuable child inside the parent turn. The persisted tool receipt links
 * the task card; the subagent service owns completion, follow-ups and stopping.
 *
 * Why a tool rather than a browser Remote: a delegated Expert IS a subagent —
 * both paths reach the same `startInProcessRun` driver — so the only real
 * question is who pulls the trigger. A browser-initiated dispatch runs outside
 * any turn, which leaves the parent transcript with no event to carry the
 * delegation: the child session becomes unreachable from the conversation and
 * its report never returns to the Agent. Starting the child inside a turn
 * reuses the delegation plumbing, so the tool call is the durable admission
 * record and child settlement is delivered through the normal lifecycle.
 *
 * Unlike `tool-subagent`, the persona here is resolved PER CALL from the Vault
 * record rather than fixed at mount time, because the Expert roster is authored
 * in the UI and changes without restarting the Host.
 *
 * @module @deepseek-ai/dsh-host-experts/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from 'node:crypto'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentActivationSpec } from '@deepseek-ai/dsh-subagent'
import type { ExpertService } from './index.ts'
import z from '@deepseek-ai/schemastery'
import { buildStartRequest } from './dispatch.ts'
import { ExpertStore } from './store.ts'
import type { ExpertRecord } from './types.ts'

/** The model-facing tool name. */
export const TOOL_NAME = 'dispatch_expert'

/** The roster face this tool reads; `ExpertStore` satisfies it. */
export interface ExpertRoster {
  list(): Promise<readonly ExpertRecord[]>
}

/**
 * Select approved delegated Experts for the dispatch roster.
 * @param records - Available Expert records.
 * @returns Experts eligible for delegated execution.
 */
export function dispatchable(records: readonly ExpertRecord[]): readonly ExpertRecord[] {
  return records.filter(record => record.status === 'approved' && record.execution === 'delegated')
}

/**
 * Resolve one Expert by exact name, then by unique case-insensitive match.
 * Names come from the model, so a near-miss must fail loudly with the real
 * roster rather than silently dispatching a different Expert.
 * @param records - the full roster.
 * @param name - the requested Expert name.
 * @returns the single matching dispatchable Expert.
 * @throws when nothing matches, or when the loose match is ambiguous.
 */
export function resolveExpert(records: readonly ExpertRecord[], name: string): ExpertRecord {
  const roster = dispatchable(records)
  const wanted = name.trim()
  const exact = roster.find(record => record.id === wanted || record.name === wanted)
  if (exact !== undefined) return exact
  const folded = wanted.toLowerCase()
  const loose = roster.filter(record => record.name.toLowerCase() === folded)
  const [single] = loose
  if (loose.length === 1 && single !== undefined) return single
  const available = roster.length === 0
    ? '(none: no Expert is both approved and delegated)'
    : roster.map(record => record.name).join(', ')
  if (loose.length > 1) {
    throw new Error(`experts: "${wanted}" matches more than one Expert; use the exact name. Available: ${available}`)
  }
  throw new Error(`experts: no approved delegated Expert named "${wanted}". Available: ${available}`)
}

/**
 * Describe the available dispatch roster for the model-facing tool.
 * @param records - Available Expert records.
 * @returns Tool description containing the eligible Expert roster.
 */
export function rosterDescription(records: readonly ExpertRecord[]): string {
  const roster = dispatchable(records)
  if (roster.length === 0) return ' No Expert is currently approved and delegated, so this tool cannot run yet.'
  return ` Available Experts: ${roster.map(r => `"${r.name}" (${r.description})`).join('; ')}.`
}

/** The narrow structural face this tool needs from the runtime Context. */
export interface ExpertToolContext {
  readonly tools: {
    register(definition: unknown): () => void
  }
  readonly subagents: {
    startActivation(spec: SubagentActivationSpec): Promise<{ readonly childId: SessionId }>
  }
  readonly experts: Pick<ExpertService, 'reserveDelegation'>
}

/** One tool execution's access to the calling Agent and its cancellation. */
export interface ExpertToolExec {
  readonly agent?: Agent
  readonly signal: AbortSignal
}

/**
 * Resolve an Expert and start a fresh or forked continuable child. Admission
 * returns immediately; child lifetime is independent of the finished tool call.
 * @param ctx - context exposing the subagent registry.
 * @param roster - the Vault roster to resolve against.
 * @param args - the model's `expert` name and `task`.
 * @param exec - the calling Agent and the turn's cancellation signal.
 * @returns the durable child admission receipt, not a completion claim.
 * @throws when the caller, roster, policy, or child startup rejects admission.
 */
export async function runExpertTool(
  ctx: ExpertToolContext,
  roster: ExpertRoster,
  args: { readonly expert: string; readonly task: string },
  exec: ExpertToolExec,
): Promise<ExpertDispatchResult> {
  if (typeof args.expert !== 'string' || typeof args.task !== 'string') throw new Error('experts: expert and task must be strings')
  const parent = exec.agent
  if (parent === undefined) {
    throw new Error('experts: dispatch_expert requires a calling agent (exec.agent was undefined)')
  }
  const expert = resolveExpert(await roster.list(), args.expert)
  const composed = buildStartRequest(expert, args.task)
  exec.signal.throwIfAborted()
  const childId = randomUUID() as SessionId
  const release = ctx.experts.reserveDelegation(parent, childId, expert)
  try {
    const { agentOptions, ...request } = composed
    const started = await ctx.subagents.startActivation({
      provider: expert.contextMode === 'fork' ? 'fork' : 'spawn',
      childId, label: expert.name, signal: exec.signal,
      delivery: 'parent',
      request: {
        ...request, parent, maxDepth: 1,
        prompt: [{ type: 'text', text: composed.prompt }],
        ...agentOptions === undefined ? {} : { agentOptions: agentOptions as NonNullable<SubagentActivationSpec['request']['agentOptions']> },
      },
    })
    return { expert: expert.name, expertId: expert.id, childId: started.childId,
      parentSessionId: parent.id, access: expert.access ?? 'read-only',
      contextMode: expert.contextMode ?? 'fresh', status: 'started' }
  } finally {
    release()
  }
}

/** Admission receipt; completion is delivered by the child lifecycle. */
export interface ExpertDispatchResult {
  readonly expert: string
  readonly expertId: string
  readonly childId: SessionId
  readonly parentSessionId: SessionId
  readonly access: 'read-only' | 'write'
  readonly contextMode: 'fresh' | 'fork'
  readonly status: 'started'
}

/**
 * Register `dispatch_expert` on the calling Agent's tool registry.
 * @param ctx - the runtime Context owning `tools` and `subagents`.
 * @param roster - the Vault Expert roster.
 * @param records - the roster snapshot used to describe available Experts.
 * @returns the registry disposer.
 */
export function registerExpertTool(
  ctx: ExpertToolContext,
  roster: ExpertRoster,
  records: readonly ExpertRecord[],
): () => void {
  return ctx.tools.register({
    name: TOOL_NAME,
    description:
      'Delegate a bounded task to an approved Vault Expert in the background. Returns a durable childId, not a completed result. '
      + 'Continue independent work; the runtime sends a settlement notice. Use send_message with childId for follow-ups and interrupt_agent '
      + 'to stop its current turn. Fresh context is the default; fork experts inherit completed turns only. Include goal, relevant context, '
      + 'owned files, deliverable and acceptance checks in task. Read-only is the default; only owner-configured write experts can change files. '
      + 'Avoid overlapping file ownership. Verify the report before claiming completion.'
      + rosterDescription(records),
    parameters: {
      type: 'object',
      required: ['expert', 'task'],
      properties: {
        expert: {
          type: 'string',
          description: 'Stable id or exact name of the approved Expert to dispatch.',
        },
        task: {
          type: 'string',
          description:
            'The task for this Expert. Include the concrete context it needs — paths, symptoms, what you '
            + 'already ruled out — because it cannot ask follow-up questions while running.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['expert', 'expertId', 'childId', 'parentSessionId', 'access', 'contextMode', 'status'],
        properties: {
          expert: { type: 'string' },
          expertId: { type: 'string' }, childId: { type: 'string' }, parentSessionId: { type: 'string' },
          access: { type: 'string', enum: ['read-only', 'write'] },
          contextMode: { type: 'string', enum: ['fresh', 'fork'] },
          status: { type: 'string', enum: ['started'] },
        },
      },
      presentationMeta: (_args: unknown, value: ExpertDispatchResult) => ({ expertDelegation: value }),
      render: (_args: unknown, value: ExpertDispatchResult) => [{
        type: 'text',
        text: `Started expert ${value.expert}: ${value.childId} (${value.access}, ${value.contextMode}). Await the settlement notice; use send_message for follow-ups. Verify its report before accepting the task.`,
      }],
    },
    // The child never mutates the parent session.
    isConcurrencySafe: () => true,
    execute: (args: { readonly expert: string; readonly task: string }, exec: ExpertToolExec) =>
      runExpertTool(ctx, roster, args, exec),
  })
}

export const name = 'tool-expert'
export const inject = ['tools', 'subagents', 'experts']

/** Config: the Vault root whose Agent Layer holds the Expert roster. */
export interface Config {
  /** Absolute or cwd-relative Vault root containing `Agents/`. */
  readonly vaultRoot: string
}
export const Config: z<Config> = z.object({ vaultRoot: z.string().required() })

/**
 * Mount `dispatch_expert` for one Agent scope.
 *
 * The roster is read once here to DESCRIBE the tool, because a tool description
 * is fixed for the session once the model sees it; each execution re-reads the
 * Vault, so an Expert edited mid-session still dispatches correctly even though
 * the advertised list is a snapshot.
 * @param ctx - the Agent-scoped Context.
 * @param config - the Vault root.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = new ExpertStore(config.vaultRoot)
  const runtime = ctx as unknown as ExpertToolContext
  let records: readonly ExpertRecord[]
  try { records = await store.list() }
  catch (error) {
    // Standard presets also run outside Agent Layer vaults; keep their existing optional expert behavior.
    ctx.logger.warn(`tool-expert: Expert roster unavailable, dispatch_expert not registered: ${String(error)}`)
    return
  }
  ctx.effect(() => registerExpertTool(runtime, store, records), 'tool-expert: dispatch_expert')
}
