/** Model-facing selective reads and revision-bound, human-confirmed progress maintenance. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-questions'
import { compactProgress } from './context.ts'
import { ProgressError, progressChangeSchema } from './domain.ts'

const string = { type: 'string', required: true } as const
const references = { type: 'array', required: true, items: { type: 'string' } } as const
const checkpoint = { type: 'object', additionalProperties: false, properties: { id: string, outcome: string, detail: string, references } } as const
const evidence = { type: 'object', required: true, additionalProperties: false,
  properties: { kind: { ...string, enum: ['passed', 'failed'] }, summary: string, references } } as const
const milestoneId = { milestoneId: string } as const
const changeParameter = {
  required: true,
  oneOf: [
    { type: 'object', additionalProperties: false, properties: {
      kind: { ...string, const: 'replace' }, milestones: { type: 'array', required: true, items: {
        type: 'object', additionalProperties: false, properties: {
          id: string, title: string, caption: string, exitCondition: string, references,
          checkpoints: { type: 'array', required: true, items: checkpoint },
        },
      } },
    } },
    { type: 'object', additionalProperties: false, properties: { kind: { ...string, const: 'approve' }, ...milestoneId } },
    { type: 'object', additionalProperties: false, properties: { kind: { ...string, const: 'start' }, ...milestoneId } },
    { type: 'object', additionalProperties: false, properties: { kind: { ...string, const: 'accept' }, ...milestoneId } },
    { type: 'object', additionalProperties: false, properties: {
      kind: { ...string, const: 'reconcile' }, checkpointId: string, evidence,
    } },
    { type: 'object', additionalProperties: false, properties: {
      kind: { ...string, const: 'refine' }, checkpointId: string, detail: string, references, reason: string,
    } },
    { type: 'object', additionalProperties: false, properties: {
      kind: { ...string, const: 'regression' }, historicalCheckpointId: string, ...milestoneId,
      checkpoint: { ...checkpoint, required: true }, insertAt: { type: 'integer', required: true }, reason: string, evidence,
    } },
    { type: 'object', additionalProperties: false, properties: { kind: { ...string, const: 'references' }, references } },
  ],
} as const
const readSchema = z.object({ milestone_id: z.string().optional(), checkpoint_id: z.string().optional() }).strict()
const updateSchema = z.object({
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), change: progressChangeSchema,
}).strict()
const humanOnly = new Set(['replace', 'approve', 'start', 'accept', 'references'])
const output = {
  schema: { type: 'json' },
  render: (_args: unknown, value: z.infer<ReturnType<typeof z.json>>) => [{ type: 'text' as const, text: JSON.stringify(value) }],
} as const

/** Require the registry's exact live driver caller, not a forged or detached Agent.
 * @param ctx - services owning Agents and turn admission.
 * @param exec - registry-supplied call identity.
 * @returns authenticated calling Agent. */
export function progressToolAgent(ctx: Context, exec: ToolRunContext) {
  const agent = exec.agent
  if (agent === undefined || ctx.agents.get(agent.id) !== agent || agent.status !== 'running'
    || ctx.agents.currentInitiator() !== agent
    || ctx.sessionProjections.stateOf(agent.session, 'turnBoundary')?.openTurnStartSeq == null)
    throw new HarnessError('progress tools require the exact live calling agent in an open model turn', 'PROGRESS_DRIVER_REQUIRED')
  return agent
}

/** Install tools and cancel in-flight confirmations before the owning fiber unloads.
 * @param ctx - owning plugin context. */
export function registerProgressTools(ctx: Context): void {
  const lifetime = new AbortController()
  ctx.effect(() => () =>{  lifetime.abort() })
  ctx.tools.register(defineTool({
    name: 'read_progress',
    description: 'Read all milestone captions and counts, or select milestone_id/checkpoint_id for details and references. This does not authorize execution.',
    parameters: { milestone_id: { type: 'string' }, checkpoint_id: { type: 'string' } }, output,
    execute(_args, exec) {
      const selector = readSchema.parse(exec.arguments)
      const view = ctx.longTermProgress.get(progressToolAgent(ctx, exec))
      if (selector.milestone_id === undefined && selector.checkpoint_id === undefined) return Promise.resolve(compactProgress(view))
      const milestone = view?.milestones.find(m => (selector.milestone_id === undefined || m.id === selector.milestone_id)
        && (selector.checkpoint_id === undefined || m.checkpoints.some(c => c.id === selector.checkpoint_id)))
      if (milestone === undefined) throw new ProgressError('selected milestone or checkpoint does not exist')
      return Promise.resolve(z.json().parse({ revision: view?.revision, milestone: selector.checkpoint_id === undefined ? milestone : {
        id: milestone.id, title: milestone.title, references: milestone.references,
        checkpoint: milestone.checkpoints.find(c => c.id === selector.checkpoint_id),
      } }))
    },
    presentCall: args => ({ card: 'generic', title: 'Read long-term progress', kind: 'read', rawInput: args }),
  }))
  ctx.tools.register(defineTool({
    name: 'update_progress',
    description: 'Maintain milestone/checkpoint progress at an exact revision. Structural changes, approval, start, acceptance and reference changes ask the user before mutation. '
      + 'reconcile requires observed passing/failed evidence, never just a Goal phase. refine changes only approved implementation details and requires a reason. '
      + 'Saving, approving or starting scope never creates or resumes an execution Goal.',
    parameters: { revision: { type: 'integer', required: true }, change: changeParameter }, output,
    async execute(_args, exec) {
      const { revision, change } = updateSchema.parse(exec.arguments)
      if (change.kind === 'vault-link' || change.kind === 'vault-settle' || change.kind === 'bind-goal')
        throw new ProgressError('operation is internal to the owning adapter')
      const agent = progressToolAgent(ctx, exec)
      const signal = AbortSignal.any([exec.signal, lifetime.signal])
      signal.throwIfAborted()
      if ((ctx.longTermProgress.get(agent)?.revision ?? 0) !== revision) throw new ProgressError('stale progress revision', 'PROGRESS_STALE')
      if (humanOnly.has(change.kind)) {
        const questions = ctx.get('userQuestions')
        if (questions === undefined) throw new ProgressError('human confirmation is unavailable; use /long-goal')
        const answer = await questions.ask({ agent, signal, wait: { callId: exec.callId }, questions: [{
          id: 'progress-change', question: `Confirm ${change.kind} at progress revision ${revision}?`,
          detail: JSON.stringify(change, null, 2), options: [{ label: 'Confirm' }, { label: 'Cancel' }],
        }] })
        signal.throwIfAborted()
        progressToolAgent(ctx, exec)
        if ((ctx.longTermProgress.get(agent)?.revision ?? 0) !== revision) throw new ProgressError('stale progress revision after confirmation', 'PROGRESS_STALE')
        const decision = answer.answers.find(a => a.id === 'progress-change')
        if (decision?.selected.length !== 1 || decision.selected[0] !== 'Confirm' || decision.custom)
          throw new ProgressError('progress change was not confirmed')
      }
      const state = ctx.longTermProgress.change(agent, { revision }, change, humanOnly.has(change.kind)
        ? { kind: 'human', source: 'direct-human-tool' } : { kind: 'maintenance' })
      return compactProgress(state)
    },
    presentCall: args => ({ card: 'generic', title: 'Update long-term progress', kind: 'other', rawInput: args }),
  }))
}
