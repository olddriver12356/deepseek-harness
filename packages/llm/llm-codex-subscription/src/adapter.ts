/**
 * `CodexSubscriptionAdapter`: spawns `codex exec` as a one-shot subprocess
 * per completion call, authenticated through the user's own Codex/ChatGPT
 * subscription (never an API key), and maps its `--json` event stream to
 * harness StreamChunks. The adapter never runs Codex's own agent loop or
 * tools — `-s read-only` plus a suppressed prompt keep it a plain completion
 * backend for DSH's own `AgentLoop`, per the fallback Decision doc.
 * @module dsh-llm-codex-subscription/adapter
 */

import { createInterface } from 'node:readline'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, LlmProviderInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SubprocessSpawnSpec, SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { translate } from './translate.ts'

/** Per-operation resolution hooks the registering plugin owns. */
export interface CodexAdapterOptions {
  /** Resolve the `codex` executable path for one operation. */
  resolveExecutable: (signal?: AbortSignal) => Promise<string>
  /** Spawn one subprocess through the harness-managed subprocess seam. */
  spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Working directory for the spawned CLI. */
  cwd: () => string
  /** SIGTERM-to-SIGKILL grace period for the spawned CLI. */
  graceMs: number
}

const CODEX_ARGS = ['exec', '-s', 'read-only', '--ignore-user-config', '--skip-git-repo-check', '--json']

/**
 * Flatten a request's system prompt and message text into one plain-text
 * prompt for `codex exec`'s stdin. Codex has no structured multi-turn input
 * mode for this route (unlike a chat-completions body), so this is a plain
 * transcript, not a lossless message-block serialization.
 * @param options - the assembled request; only text-bearing blocks are read.
 * @returns the stdin prompt.
 */
/**
 * Extract the readable text of one block. `tool-result` recurses into its
 * nested content so a PRIOR turn's tool output (e.g. from a DeepSeek-routed
 * turn earlier in the same session) survives into this route's prompt
 * instead of silently vanishing, the block just isn't a live tool call here.
 */
function blockText(block: ContentBlock): string {
  if (block.type === 'text') return block.text
  if (block.type === 'tool-result') return block.content.map(blockText).filter(Boolean).join('\n')
  return ''
}

function buildPrompt(options: GenerateOptions): string {
  const parts: string[] = []
  if (options.system) parts.push(options.system)
  for (const message of options.messages) {
    const text = message.content.map(blockText).filter(Boolean).join('\n')
    if (text.length > 0) parts.push(`[${message.role}]\n${text}`)
  }
  // ponytail: plain-text role tags, not a lossless transcript — reasoning
  // and image blocks are still dropped (text and tool-result content
  // survive). Codex never sees a live tool call on this route (-s
  // read-only, no tools exposed); revisit if a routed turn needs reasoning
  // or image fidelity.
  return parts.join('\n\n')
}

/** Plain-completion adapter for the Codex subscription fallback route. */
export class CodexSubscriptionAdapter extends LlmAdapter {
  constructor(private readonly config: CodexAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Codex (subscription)' }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const executable = await this.config.resolveExecutable(options.signal)
    const handle = this.config.spawn({
      argv: [executable, ...CODEX_ARGS],
      cwd: this.config.cwd(),
      stdio: {
        stdin: { data: buildPrompt(options) },
        stdout: 'pipe',
        stderr: { maxBytes: 64 * 1024 },
      },
      graceMs: this.config.graceMs,
      signal: options.signal,
    })
    if (!handle.stdout) {
      throw new LlmError('codex exec: subprocess produced no stdout stream', 'TRANSPORT')
    }

    const lines = createInterface({ input: handle.stdout })
    try {
      yield* translate(lines)
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        throw new LlmError('codex exec request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError('codex exec stream failed', 'TRANSPORT', { cause: error })
    } finally {
      lines.close()
      handle.terminate()
    }

    const outcome = await handle.done
    if (outcome.exitCode !== 0 && outcome.exitCode !== null) {
      throw new LlmError(`codex exec exited with code ${outcome.exitCode}`, 'SERVER')
    }
  }
}
