/**
 * Wire shapes for `claude -p --output-format stream-json`'s JSONL event
 * stream, verified live 2026-08-23 against a real `claude -p
 * --output-format stream-json --include-partial-messages --verbose
 * --setting-sources "" --disallowedTools ... --add-dir ...` call. Claude
 * Code documents no formal schema for this stream, so this is a minimal
 * observed-shape typing covering exactly the events this adapter consumes;
 * `system`, `assistant` (a redundant echo of the streamed message), and
 * `rate_limit_event` top-level events are deliberately untyped chrome.
 * @module dsh-llm-claude-code-subscription/types
 */

export interface ClaudeContentBlockStartEvent {
  type: 'content_block_start'
  index: number
  content_block: { type: string }
}

/** Incremental text emitted by Claude Code. */
export interface ClaudeTextDelta {
  type: 'text_delta'
  text: string
}

/** A non-text delta ignored by this adapter. */
export interface ClaudeOtherDelta {
  type: string
}

/** A streamed content-block update. */
export interface ClaudeContentBlockDeltaEvent {
  type: 'content_block_delta'
  index: number
  delta: ClaudeTextDelta | ClaudeOtherDelta
}

/** The end marker for one streamed content block. */
export interface ClaudeContentBlockStopEvent {
  type: 'content_block_stop'
  index: number
}

/** Any other stream_event shape (message_start, message_delta, message_stop, ...); not consumed. */
export interface ClaudeOtherStreamEvent {
  type: string
}

/** Stream events that may arrive inside a `stream_event` line. */
export type ClaudeStreamEvent =
  | ClaudeContentBlockStartEvent
  | ClaudeContentBlockDeltaEvent
  | ClaudeContentBlockStopEvent
  | ClaudeOtherStreamEvent

/** A top-level line containing one stream event. */
export interface ClaudeStreamEventLine {
  type: 'stream_event'
  event: ClaudeStreamEvent
}

/** Token usage reported by Claude Code for a completed turn. */
export interface ClaudeUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}

/** Terminal event carrying the authoritative usage and stop outcome for the turn. */
export interface ClaudeResultLine {
  type: 'result'
  subtype: string
  is_error: boolean
  usage?: ClaudeUsage
  result?: string
}

/** Any other top-level line (`system`, `assistant`, `rate_limit_event`, ...); deliberately discarded. */
export interface ClaudeOtherLine {
  type: string
}

/** Top-level Claude Code JSONL lines accepted by the translator. */
export type ClaudeLine = ClaudeStreamEventLine | ClaudeResultLine | ClaudeOtherLine
