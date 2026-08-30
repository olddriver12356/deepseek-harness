/**
 * Register a {@link ClaudeCodeSubscriptionAdapter} for the
 * `claude-code-subscription` provider route on `ctx.llm`. Plain-completion
 * fallback: authenticated through the user's existing Claude subscription
 * via `claude -p`, never an API key, and never Claude Code's own agent loop
 * (`--disallowedTools`, no tools reachable). See the DeepSeek Harness
 * fallback Decision doc.
 * @module @deepseek-ai/dsh-llm-claude-code-subscription
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ClaudeCodeSubscriptionAdapter } from './adapter.ts'
import type { ClaudeAdapterOptions } from './adapter.ts'

export { ClaudeCodeSubscriptionAdapter } from './adapter.ts'
export type { ClaudeAdapterOptions } from './adapter.ts'
export type * from './types.ts'

export const name = 'llm-claude-code-subscription'
export const inject = ['llm', 'subprocess']

/** The one provider route this plugin owns. */
const PROVIDER = 'claude-code-subscription'
const DEFAULT_EXECUTABLE = 'claude'
const DEFAULT_GRACE_MS = 5_000

/** Configuration for the Claude Code subscription adapter plugin. */
export interface Config {
  /** `claude` executable path or bare PATH name; defaults to `claude`. */
  executable?: string
  /** Working directory for the spawned CLI (`--add-dir`); defaults to the host process cwd. */
  cwd?: string
  /** SIGTERM-to-SIGKILL grace period; defaults to 5000ms. */
  graceMs?: number
}

export const Config: z<Config> = z.object({
  executable: z.string().default(DEFAULT_EXECUTABLE),
  cwd: z.string(),
  graceMs: z.number().step(1).min(1).default(DEFAULT_GRACE_MS),
})

export function apply(ctx: Context, config: Config): void {
  const options: ClaudeAdapterOptions = {
    resolveExecutable: signal =>
      ctx.subprocess.resolveExecutable(config.executable ?? DEFAULT_EXECUTABLE, undefined, signal),
    spawn: spec => ctx.subprocess.spawn(spec),
    cwd: () => config.cwd ?? process.cwd(),
    graceMs: config.graceMs ?? DEFAULT_GRACE_MS,
  }
  const adapter = new ClaudeCodeSubscriptionAdapter(options)
  ctx.llm.registerAdapter([PROVIDER], adapter)
}
