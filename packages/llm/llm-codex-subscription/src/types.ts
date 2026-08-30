/**
 * Wire shapes for `codex exec --json`'s JSONL event stream, verified live
 * 2026-08-23 against a real `codex exec -s read-only --ignore-user-config
 * --skip-git-repo-check --json` call. Codex documents no formal schema for
 * this stream (`codex exec --help` only says "Print events to stdout as
 * JSONL"), so this is a minimal observed-shape typing, not a full contract.
 * @module dsh-llm-codex-subscription/types
 */

/** Turn lifecycle bookkeeping events; carry no model content. */
export interface CodexThreadStartedEvent {
  type: 'thread.started'
  thread_id: string
}

/** The start marker for one Codex turn. */
export interface CodexTurnStartedEvent {
  type: 'turn.started'
}

/** The real model reply, arrives whole (no token-level deltas observed). */
export interface CodexAgentMessageItem {
  id: string
  type: 'agent_message'
  text: string
}

/** Non-content chrome, e.g. the "skill descriptions were shortened" budget warning. */
export interface CodexErrorItem {
  id: string
  type: 'error'
  message: string
}

/** Any other item type this stream may emit; treated as chrome and discarded. */
export interface CodexOtherItem {
  id: string
  type: string
}

/** Items carried by `item.completed` events. */
export type CodexItem = CodexAgentMessageItem | CodexErrorItem | CodexOtherItem

/** A completed Codex output item. */
export interface CodexItemCompletedEvent {
  type: 'item.completed'
  item: CodexItem
}

/** Token usage reported by Codex for a completed turn. */
export interface CodexUsage {
  input_tokens: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
  output_tokens: number
  reasoning_output_tokens?: number
}

/** The terminal event carrying turn usage. */
export interface CodexTurnCompletedEvent {
  type: 'turn.completed'
  usage: CodexUsage
}

/** Any other top-level event type; treated as chrome and discarded. */
export interface CodexOtherEvent {
  type: string
}

/** Top-level Codex JSONL events accepted by the translator. */
export type CodexEvent =
  | CodexThreadStartedEvent
  | CodexTurnStartedEvent
  | CodexItemCompletedEvent
  | CodexTurnCompletedEvent
  | CodexOtherEvent
