/**
 * Compose the persona and task for one stored delegated Expert.
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

/** A route field carrying `inherit` expresses no override. */
function override(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed === '' || trimmed === 'inherit' ? undefined : trimmed
}

/** Per-task child composition; the caller supplies provider, parent and cancellation. */
export interface ExpertStartRequest {
  readonly label: string
  readonly prompt: string
  readonly persona: string
  readonly agentOptions?: { readonly model?: string; readonly reasoningEffort?: string }
}

/**
 * Compose the start request for one delegated Expert.
 * @param expert - the stored Expert record.
 * @param task - the user's task for this dispatch.
 * @returns the persona, task and optional model selection for the child.
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
    persona: `${expert.instructions}\n\n## Delegated task contract\nWork only on the assigned task. ${expert.access === 'write' ? 'Writing is allowed within the parent permission scope; respect assigned file ownership.' : 'Only approved read-only tools are available. Do not modify files or execute programs.'} Do not delegate further. Return findings, evidence, changes (if any), verification, and unresolved questions. The parent owns acceptance and the final reply to the user.`,
    ...Object.keys(agentOptions).length === 0 ? {} : { agentOptions },
  }
}
