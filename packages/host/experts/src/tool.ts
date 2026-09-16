/**
 * Model-facing `dispatch_expert` tool: start one approved, delegated Vault
 * Expert as a subagent from INSIDE the calling Agent's turn.
 *
 * Why a tool rather than a browser Remote: a delegated Expert IS a subagent —
 * both paths reach the same `startInProcessRun` driver — so the only real
 * question is who pulls the trigger. A browser-initiated dispatch runs outside
 * any turn, which leaves the parent transcript with no event to carry the
 * delegation: the child session becomes unreachable from the conversation and
 * its report never returns to the Agent. Starting the child inside a turn
 * reuses the delegation plumbing that already works, so the tool call is the
 * durable record and the tool result is the return path.
 *
 * Unlike `tool-subagent`, the persona here is resolved PER CALL from the Vault
 * record rather than fixed at mount time, because the Expert roster is authored
 * in the UI and changes without restarting the Host.
 *
 * @module @deepseek-ai/dsh-host-experts/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { buildStartRequest, FORK_PROVIDER, outputText, type OutputBlock } from './dispatch.ts'
import { ExpertStore } from './store.ts'
import type { ExpertRecord } from './types.ts'

/** The model-facing tool name. */
export const TOOL_NAME = 'dispatch_expert'

/** The roster face this tool reads; `ExpertStore` satisfies it. */
export interface ExpertRoster {
  list(): Promise<readonly ExpertRecord[]>
}

/** An Expert is dispatchable exactly when it is approved AND delegated. */
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
  const exact = roster.find(record => record.name === wanted)
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

/** Render the roster for the tool description so the model can choose without a second call. */
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
    start(name: string, request: Record<string, unknown>): Promise<{
      readonly result: Promise<{
        readonly output: readonly OutputBlock[]
        readonly stopReason: string
        readonly diagnostic?: string
      }>
      dispose(): void | Promise<void>
    }>
  }
}

/** One tool execution's access to the calling Agent and its cancellation. */
export interface ExpertToolExec {
  readonly agent?: unknown
  readonly signal: AbortSignal
}

/**
 * Run one `dispatch_expert` call: resolve the Expert, start the forked child,
 * and return its final text so the tool result carries the report back into the
 * parent turn.
 * @param ctx - context exposing the subagent registry.
 * @param roster - the Vault roster to resolve against.
 * @param args - the model's `expert` name and `task`.
 * @param exec - the calling Agent and the turn's cancellation signal.
 * @returns the child's final text.
 * @throws when no Agent is calling, resolution fails, or the run does not complete.
 */
export async function runExpertTool(
  ctx: ExpertToolContext,
  roster: ExpertRoster,
  args: { readonly expert: string; readonly task: string },
  exec: ExpertToolExec,
): Promise<{ readonly expert: string; readonly text: string }> {
  const parent = exec.agent
  if (parent === undefined || parent === null) {
    throw new Error('experts: dispatch_expert requires a calling agent (exec.agent was undefined)')
  }
  const expert = resolveExpert(await roster.list(), args.expert)
  const composed = buildStartRequest(expert, args.task)
  exec.signal.throwIfAborted()
  const run = await ctx.subagents.start(FORK_PROVIDER, { ...composed, parent, signal: exec.signal })
  try {
    const result = await run.result
    if (result.stopReason !== 'completed') {
      throw new Error(
        `experts: "${expert.name}" ended as "${result.stopReason}"`
        + (result.diagnostic === undefined ? '' : `: ${result.diagnostic}`),
      )
    }
    return { expert: expert.name, text: outputText(result.output) }
  } finally {
    await run.dispose()
  }
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
      'Dispatch an approved Vault Expert as a subagent. The Expert\'s recorded instructions become the '
      + 'child\'s persona, shadowing the deployment persona, so the child works as that Expert rather than '
      + 'as a general assistant. Use this when a task matches an Expert\'s method. The child inherits this '
      + 'conversation\'s completed turns, works in its own context, and returns only its final report — its '
      + 'intermediate steps do not consume this conversation. It cannot ask you questions mid-run, so state '
      + 'everything it needs in `task`.'
      + rosterDescription(records),
    parameters: {
      type: 'object',
      required: ['expert', 'task'],
      properties: {
        expert: {
          type: 'string',
          description: 'Exact name of the approved Expert to dispatch.',
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
        required: ['expert', 'text'],
        properties: {
          expert: { type: 'string' },
          text: { type: 'string' },
        },
      },
      render: (_args: unknown, value: { readonly expert: string; readonly text: string }) => [{
        type: 'text',
        text: value.text,
      }],
    },
    // The child never mutates the parent session.
    isConcurrencySafe: () => true,
    execute: (args: { readonly expert: string; readonly task: string }, exec: ExpertToolExec) =>
      runExpertTool(ctx, roster, args, exec),
  })
}

export const name = 'tool-expert'
export const inject = ['tools', 'subagents']

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
export function apply(ctx: Context, config: Config): void {
  const store = new ExpertStore(config.vaultRoot)
  const runtime = ctx as unknown as ExpertToolContext
  void store.list().then((records) => {
    ctx.effect(() => registerExpertTool(runtime, store, records), 'tool-expert: dispatch_expert')
  }, (error: unknown) => {
    // A missing or unreadable Vault must not take the Agent down; the tool is
    // simply absent, and the Experts panel surfaces the same read failure.
    ctx.logger.warn(`tool-expert: Expert roster unavailable, dispatch_expert not registered: ${String(error)}`)
  })
}
