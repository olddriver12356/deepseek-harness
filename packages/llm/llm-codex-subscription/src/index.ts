/**
 * Register a {@link CodexSubscriptionAdapter} for the `codex-subscription`
 * provider route on `ctx.llm`. Plain-completion fallback: authenticated
 * through the user's existing Codex/ChatGPT subscription via `codex exec`,
 * never an API key, and never Codex's own agent loop (`-s read-only`, no
 * tools exposed). See the DeepSeek Harness fallback Decision doc.
 * @module @deepseek-ai/dsh-llm-codex-subscription
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { CodexSubscriptionAdapter } from './adapter.ts'
import type { CodexAdapterOptions } from './adapter.ts'

export { CodexSubscriptionAdapter } from './adapter.ts'
export type { CodexAdapterOptions } from './adapter.ts'
export type * from './types.ts'

export const name = 'llm-codex-subscription'
export const inject = ['llm', 'subprocess']

/** The one provider route this plugin owns. */
const PROVIDER = 'codex-subscription'
const DEFAULT_EXECUTABLE = 'codex'
const DEFAULT_GRACE_MS = 5_000

/** Configuration for the Codex subscription adapter plugin. */
export interface Config {
  /** `codex` executable path or bare PATH name; defaults to `codex`. */
  executable?: string
  /** Working directory for the spawned CLI; defaults to the host process cwd. */
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
  const options: CodexAdapterOptions = {
    resolveExecutable: signal =>
      ctx.subprocess.resolveExecutable(config.executable ?? DEFAULT_EXECUTABLE, undefined, signal),
    spawn: spec => ctx.subprocess.spawn(spec),
    cwd: () => config.cwd ?? process.cwd(),
    graceMs: config.graceMs ?? DEFAULT_GRACE_MS,
  }
  const adapter = new CodexSubscriptionAdapter(options)
  ctx.llm.registerAdapter([PROVIDER], adapter)
}
