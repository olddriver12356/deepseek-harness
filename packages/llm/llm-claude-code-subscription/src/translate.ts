/**
 * Translate `claude -p --output-format stream-json` JSONL lines into the
 * harness `StreamChunk` protocol. Only the `text` content-block type is
 * handled for v1 (tools are disallowed on this route and reasoning/thinking
 * is not requested, so no `tool_use`/`thinking` blocks are expected; extend
 * if a routed turn ever needs either). `system`, `assistant`, and
 * `rate_limit_event` top-level lines are chrome and discarded outright.
 * @module dsh-llm-claude-code-subscription/translate
 */

import { EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type {
  ClaudeContentBlockDeltaEvent,
  ClaudeContentBlockStartEvent,
  ClaudeLine,
  ClaudeResultLine,
  ClaudeStreamEventLine,
} from './types.ts'

function mapUsage(usage: {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    ...usage.cache_read_input_tokens !== undefined ? { cacheReadTokens: usage.cache_read_input_tokens } : {},
    ...usage.cache_creation_input_tokens !== undefined ? { cacheWriteTokens: usage.cache_creation_input_tokens } : {},
  }
}

function mapFinish(line: { subtype: string; is_error: boolean; result?: string }): FinishReason {
  if (!line.is_error && line.subtype === 'success') return { kind: 'stop' }
  return {
    kind: 'error',
    failure: { message: line.result ?? `claude -p ended: ${line.subtype}`, code: line.subtype.toUpperCase() },
  }
}

/**
 * Consume JSONL text lines from `claude -p --output-format stream-json` and
 * yield StreamChunks.
 * @param lines - raw stdout lines, one JSON event per line.
 * @returns text deltas as they arrive, then `block-end`, `usage`, and
 *   `finish` at the terminal `result` line. A `result` with no opened text
 *   block maps to an `EMPTY_RESPONSE` error finish.
 */
export async function* translate(lines: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let text: string | undefined

  for await (const raw of lines) {
    if (raw.trim().length === 0) continue
    let line: ClaudeLine
    try {
      line = JSON.parse(raw) as ClaudeLine
    } catch {
      throw new LlmError(`malformed claude stream-json line: ${raw.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    if (line.type === 'stream_event') {
      const event = (line as ClaudeStreamEventLine).event
      if (event.type === 'content_block_start'
        && (event as ClaudeContentBlockStartEvent).content_block.type === 'text') {
        if (text === undefined) {
          text = ''
          yield { type: 'block-start', index: 0, blockType: 'text' }
        }
        continue
      }
      if (event.type === 'content_block_delta'
        && (event as ClaudeContentBlockDeltaEvent).delta.type === 'text_delta') {
        const delta = ((event as ClaudeContentBlockDeltaEvent).delta as { type: 'text_delta'; text: string }).text
        text = (text ?? '') + delta
        yield { type: 'text-delta', index: 0, text: delta }
        continue
      }
      // content_block_stop, message_start/delta/stop: no content of their own.
      continue
    }

    if (line.type === 'result') {
      const result = line as ClaudeResultLine
      if (text !== undefined) {
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
      }
      if (result.usage) yield { type: 'usage', usage: mapUsage(result.usage) }
      yield {
        type: 'finish',
        reason: text === undefined && !result.is_error
          ? {
            kind: 'error',
            failure: { message: 'claude -p returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
          }
          : mapFinish(result),
      }
      return
    }

    // system, assistant, rate_limit_event: deliberately discarded chrome.
  }

  throw new LlmError('claude stream-json ended without a result line', 'STREAM_CLOSED')
}
