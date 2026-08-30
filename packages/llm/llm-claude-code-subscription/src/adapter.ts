/**
 * `ClaudeCodeSubscriptionAdapter`: spawns `claude -p` as a one-shot
 * subprocess per completion call, authenticated through the user's own
 * Claude subscription (never an API key), and maps its `stream-json` event
 * stream to harness StreamChunks. The adapter never lets Claude Code run its
 * own tools — `--disallowedTools` plus a suppressed prompt keep it a plain
 * completion backend for DSH's own `AgentLoop`, per the fallback Decision doc.
 * @module dsh-llm-claude-code-subscription/adapter
 */

import { createInterface } from 'node:readline'
import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, LlmProviderInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { SubprocessSpawnSpec, SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { translate } from './translate.ts'

/** Per-operation resolution hooks the registering plugin owns. */
export interface ClaudeAdapterOptions {
  /** Resolve the `claude` executable path for one operation. */
  resolveExecutable: (signal?: AbortSignal) => Promise<string>
  /** Spawn one subprocess through the harness-managed subprocess seam. */
  spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  /** Working directory for the spawned CLI (`--add-dir`). */
  cwd: () => string
  /** SIGTERM-to-SIGKILL grace period for the spawned CLI. */
  graceMs: number
}

/**
 * Built-in Claude Code tool names to deny. Deliberately excludes
 * MCP-provided tools (`mcp__*`): those are machine/session specific — this
 * machine's own `system|init` event lists dozens (Gmail, Postman, Drive)
 * that have no business hardcoded into a shipped package.
 *
 * ponytail: this is the enumerated-deny-list risk Open Question #4 already
 * flagged — an unlisted new built-in tool, or any MCP tool, is not denied.
 * Real fix: one bootstrap `claude -p` call at plugin load to read the live
 * `system|init.tools` list and cache it, replacing this constant. Not done
 * for v1; ship this list, verify it stays current when Claude Code updates.
 */
const DISALLOWED_TOOLS = [
  'Task', 'Bash', 'CronCreate', 'CronDelete', 'CronList', 'DesignSync', 'Edit',
  'EnterWorktree', 'ExitWorktree', 'Glob', 'Grep', 'ListAgents', 'ListMcpResourcesTool',
  'Monitor', 'NotebookEdit', 'PowerShell', 'PushNotification', 'Read',
  'ReadMcpResourceDirTool', 'ReadMcpResourceTool', 'RemoteTrigger', 'ReportFindings',
  'ScheduleWakeup', 'SendMessage', 'Skill', 'TaskOutput', 'TaskStop', 'ToolSearch',
  'WebFetch', 'WebSearch', 'Workflow', 'Write',
].join(',')

function claudeArgs(cwd: string): string[] {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--setting-sources', '',
    '--disallowedTools', DISALLOWED_TOOLS,
    '--add-dir', cwd,
  ]
}

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

/**
 * Flatten a request's system prompt and message text into one plain-text
 * prompt for `claude -p`'s stdin. Same limitation as the Codex route's
 * `buildPrompt`: plain role-tagged transcript, not a lossless block
 * serialization; reasoning and image blocks are still dropped.
 * @param options - the assembled request; text and tool-result blocks are read.
 * @returns the stdin prompt.
 */
function buildPrompt(options: GenerateOptions): string {
  const parts: string[] = []
  if (options.system) parts.push(options.system)
  for (const message of options.messages) {
    const text = message.content.map(blockText).filter(Boolean).join('\n')
    if (text.length > 0) parts.push(`[${message.role}]\n${text}`)
  }
  return parts.join('\n\n')
}

/** Plain-completion adapter for the Claude Code subscription fallback route. */
export class ClaudeCodeSubscriptionAdapter extends LlmAdapter {
  constructor(private readonly config: ClaudeAdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Claude Code (subscription)' }
  }

  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const executable = await this.config.resolveExecutable(options.signal)
    const cwd = this.config.cwd()
    const handle = this.config.spawn({
      argv: [executable, ...claudeArgs(cwd)],
      cwd,
      stdio: {
        stdin: { data: buildPrompt(options) },
        stdout: 'pipe',
        stderr: { maxBytes: 64 * 1024 },
      },
      graceMs: this.config.graceMs,
      signal: options.signal,
    })
    if (!handle.stdout) {
      throw new LlmError('claude -p: subprocess produced no stdout stream', 'TRANSPORT')
    }

    const lines = createInterface({ input: handle.stdout })
    try {
      yield* translate(lines)
    } catch (error: unknown) {
      if (options.signal?.aborted) {
        throw new LlmError('claude -p request aborted by caller', 'ABORTED', { cause: error })
      }
      if (error instanceof LlmError) throw error
      throw new LlmError('claude -p stream failed', 'TRANSPORT', { cause: error })
    } finally {
      lines.close()
      handle.terminate()
    }

    const outcome = await handle.done
    if (outcome.exitCode !== 0 && outcome.exitCode !== null) {
      throw new LlmError(`claude -p exited with code ${outcome.exitCode}`, 'SERVER')
    }
  }
}
