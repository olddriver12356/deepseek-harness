/**
 * Delegated Expert dispatch: compose and run one forked child from a stored
 * Expert record.
 *
 * The Expert's instructions become the child's `persona`, which SHADOWS the
 * deployment persona rather than appending to it. That substitution is the
 * whole reason a delegated Expert differs from a Skill, whose body is optional
 * instruction text the model may choose to read.
 *
 * A child owned by a live parent cannot address the user (`DELEGATED_CALLER` in
 * `@deepseek-ai/dsh-interaction-user-questions`), so the root cause is
 * established with the user in the parent Session BEFORE dispatch, and an
 * Expert that still meets an ambiguity returns it instead of guessing.
 *
 * @module @deepseek-ai/dsh-host-experts/dispatch
 */

import type { ExpertRecord } from './types.ts'

/** The provider name registered by `@deepseek-ai/dsh-subagent-fork-in-process`. */
export const FORK_PROVIDER = 'fork'

/** A route field carrying `inherit` expresses no override. */
function override(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' || trimmed === 'inherit' ? undefined : trimmed
}

/** The subset of a fork start request this module owns; the caller adds `parent` and `signal`. */
export interface ExpertStartRequest {
  readonly label: string
  readonly prompt: string
  readonly persona: string
  readonly agentOptions?: { readonly model?: string; readonly reasoningEffort?: string }
}

/**
 * Compose the fork start request for one delegated Expert.
 * @param expert - the stored Expert record.
 * @param task - the user's task for this dispatch.
 * @returns the composition passed to `ctx.subagents.start('fork', …)`.
 * @throws when the Expert is not delegated, not approved, or the task is empty.
 */
export function buildStartRequest(expert: ExpertRecord, task: string): ExpertStartRequest {
  if (expert.execution !== 'delegated') {
    throw new Error('experts: only a delegated Expert can be dispatched as a subagent')
  }
  if (expert.status !== 'approved') {
    throw new Error('experts: only an approved Expert can be dispatched')
  }
  const prompt = task.trim()
  if (prompt === '') throw new Error('experts: dispatch requires a task')

  const model = override(expert.model)
  const reasoningEffort = override(expert.reasoning)
  const agentOptions = {
    ...model === undefined ? {} : { model },
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
  }
  return {
    label: expert.name,
    prompt,
    persona: expert.instructions,
    ...Object.keys(agentOptions).length === 0 ? {} : { agentOptions },
  }
}

/** One block of the child's final assistant output. */
export interface OutputBlock { readonly type: string; readonly text?: string }

/**
 * Flatten the child's final assistant output to text. `SubagentResult.output`
 * is a `ContentBlock[]`, never a plain string, and it is `[]` when the child
 * produced neither a non-empty message nor an accumulated text stream.
 * @param output - the child's terminal content blocks.
 * @returns the concatenated, trimmed text.
 */
export function outputText(output: readonly OutputBlock[]): string {
  return output
    .filter((block): block is OutputBlock & { text: string } =>
      block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('')
    .trim()
}

// A turn-EXTERNAL dispatch entry point used to live here, started by the
// browser against a Session id. It was removed rather than repaired: a child
// started outside any turn leaves no event in the parent transcript, so the
// child session was unreachable from the conversation and its report could not
// return to the Agent. `./tool.ts` owns the turn-internal entry point instead.
