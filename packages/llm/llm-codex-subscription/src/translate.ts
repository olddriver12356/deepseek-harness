/**
 * Translate `codex exec --json` JSONL lines into the harness `StreamChunk`
 * protocol. Codex's stream carries no token-level deltas (verified live
 * 2026-08-23: each `agent_message` item arrives whole), so this yields at
 * most one text block per turn, not a real token stream, unlike DeepSeek's
 * `translate.ts`. `error`-type items and every other event/item shape are
 * chrome (hook/skill/budget warnings) and are discarded, never surfaced as
 * model content.
 * @module dsh-llm-codex-subscription/translate
 */

import { EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { CodexAgentMessageItem, CodexEvent, CodexItemCompletedEvent, CodexTurnCompletedEvent, CodexUsage } from './types.ts'

function mapUsage(usage: CodexUsage): TokenUsage {
  return {
    inputTokens: usage.input_tokens - (usage.cached_input_tokens ?? 0),
    outputTokens: usage.output_tokens,
    ...usage.cached_input_tokens !== undefined ? { cacheReadTokens: usage.cached_input_tokens } : {},
    ...usage.cache_write_input_tokens !== undefined ? { cacheWriteTokens: usage.cache_write_input_tokens } : {},
    ...usage.reasoning_output_tokens !== undefined ? { reasoningTokens: usage.reasoning_output_tokens } : {},
  }
}

/**
 * Consume JSONL text lines from `codex exec --json` and yield StreamChunks.
 * Malformed JSON lines abort the stream with `MALFORMED_RESPONSE`.
 * @param lines - raw stdout lines, one JSON event per line.
 * @returns the one text block (if any), usage, then finish; a turn with no
 *   `agent_message` item maps to an `EMPTY_RESPONSE` error finish.
 */
export async function* translate(lines: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let text: string | undefined
  let usage: TokenUsage | undefined

  for await (const line of lines) {
    if (line.trim().length === 0) continue
    let event: CodexEvent
    try {
      event = JSON.parse(line) as CodexEvent
    } catch {
      throw new LlmError(`malformed codex --json line: ${line.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    if (event.type === 'item.completed' && (event as CodexItemCompletedEvent).item.type === 'agent_message') {
      // ponytail: whole-message text, not incremental — codex's --json stream
      // has no token-delta shape to translate. Upgrade if a future codex
      // version adds one.
      text = ((event as CodexItemCompletedEvent).item as CodexAgentMessageItem).text
      continue
    }
    if (event.type === 'turn.completed') {
      usage = mapUsage((event as CodexTurnCompletedEvent).usage)
      continue
    }
    // thread.started, turn.started, error items, and any unrecognized event
    // are chrome — deliberately discarded, not surfaced as StreamChunks.
  }

  // The stream ended without its own terminal marker: caller abort or a
  // killed subprocess, not a genuine empty completion. Throw so the adapter's
  // catch block can check options.signal and surface ABORTED instead of this
  // being misread as "the model returned nothing" (mirrors the Claude
  // adapter's translate.ts, which throws STREAM_CLOSED the same way).
  if (usage === undefined) {
    throw new LlmError('codex --json stream ended without a turn.completed event', 'STREAM_CLOSED')
  }

  if (text === undefined) {
    yield { type: 'usage', usage }
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'codex exec produced no agent_message item', code: EMPTY_RESPONSE_CODE },
      },
    }
    return
  }

  yield { type: 'block-start', index: 0, blockType: 'text' }
  yield { type: 'text-delta', index: 0, text }
  yield { type: 'block-end', index: 0, block: { type: 'text', text } }
  yield { type: 'usage', usage }
  yield { type: 'finish', reason: { kind: 'stop' } }
}
