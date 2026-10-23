/** Released-scope bridge over the existing Goal service; no independent execution driver. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { GoalError, type GoalView } from '@deepseek-ai/dsh-goal'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { currentMilestone, eligibleCheckpoints, checkpointId, milestoneId, ProgressError } from './domain.ts'
import { progressToolAgent } from './tools.ts'
import type { AdvanceProgressGoal, ProgressRef, ProgressView } from './types.ts'

/** Install scope validation and return the service-owned advancement operation.
 * @param ctx - lifecycle owner with Goal, progress and Agent services.
 * @returns synchronous scope-checked advancement operation. */
export function registerProgressGoals(ctx: Context) {
  const activeReleases = new Map<Agent, number>()
  ctx.on('agent/disposed', ({ agent }) => { activeReleases.delete(agent) })
  const pending = new WeakMap<Agent, string>()
  const released = (agent: Agent, view: ProgressView) => view.release !== null
    && activeReleases.get(agent) === view.release.revision
  const usable = (view: ProgressView) => {
    const milestone = currentMilestone(view)
    return milestone !== null && view.release?.milestoneId === milestone.id
      && milestone.checkpoints.some(c => !c.complete)
  }
  ctx.goals.registerValidator((agent, goal, operation) => {
    const view = ctx.longTermProgress.get(agent)
    if (view === null || view.milestones.length === 0) return
    if (!usable(view)) throw new GoalError('progress milestone awaits authorization or verification', 'GOAL_INVALID_TRANSITION')
    if (pending.get(agent) === goal.objective && released(agent, view)) return
    const binding = view.goalBinding
    const milestone = currentMilestone(view)
    const firstUnfinished = milestone?.checkpoints.find(c => !c.complete)
    if (binding !== null && (firstUnfinished === undefined || !binding.checkpointIds.includes(firstUnfinished.id)))
      throw new GoalError('progress Goal group is complete; advance to the next eligible group', 'GOAL_INVALID_TRANSITION')
    const existing = ctx.goals.get(agent)
    if ((operation === 'continue' || operation === 'resume') && binding !== null
      && binding.goal.id === goal.id && existing?.objective === goal.objective
      && (operation === 'resume' || (binding.goal.revision === goal.revision && released(agent, view)))) return
    throw new GoalError('Goal is not bound to released milestone checkpoints; clarify scope and use advance_progress_goal', 'GOAL_INVALID_TRANSITION')
  })
  ctx.on('session/event', (session, event) => {
    const agent = ctx.agents.get(session.id)
    if (agent === undefined || agent.session !== session) return
    if (event.type === 'progress/change') {
      const view = ctx.longTermProgress.get(agent)
      if (event.data.change.kind === 'start' && view?.release !== null && view?.release !== undefined)
        activeReleases.set(agent, view.release.revision)
      if (view !== null && !usable(view)) ctx.goals.disarm(agent)
    }
    if (event.type === 'turn/end' && event.data.reason.kind === 'aborted') activeReleases.delete(agent)
  })
  ctx.on('goal/changed', ({ agent, change }) => {
    if (change.operation === 'pause' || change.operation === 'clear') activeReleases.delete(agent)
    if (change.operation === 'resume') {
      const view = ctx.longTermProgress.get(agent)
      if (view?.release !== null && view?.release !== undefined) {
        activeReleases.set(agent, view.release.revision)
        if (view.goalBinding !== null && change.goal !== undefined)
          ctx.longTermProgress.change(agent, view, { kind: 'bind-goal', binding: {
            ...view.goalBinding, goal: { id: change.goal.id, revision: change.goal.revision },
          } }, { kind: 'maintenance' })
      }
    }
  })
  const advance = (agent: Agent, ref: ProgressRef, request: AdvanceProgressGoal): GoalView => {
    const view = ctx.longTermProgress.get(agent)
    if (view === null || view.revision !== ref.revision) throw new ProgressError('stale progress revision', 'PROGRESS_STALE')
    if (!released(agent, view)) throw new ProgressError('milestone requires a fresh human start or resume after restart, pause or cancellation')
    if (!eligibleCheckpoints(view, request.milestoneId, request.checkpointIds))
      throw new ProgressError('Goal group must be consecutive unfinished checkpoints in the released milestone')
    if (ctx.sessionProjections.stateOf(agent.session, 'longTermProgressContext')?.needsReview)
      throw new ProgressError('reconcile recent evidence or record review before switching Goals again')
    const objective = request.objective.trim()
    if (objective.length === 0 || objective.length > 4096) throw new ProgressError('Goal objective must contain 1–4096 characters')
    const old = ctx.goals.get(agent)
    const completedGroup = view.goalBinding !== null && view.goalBinding.checkpointIds.every(id =>
      view.milestones.some(m => m.checkpoints.some(c => c.id === id && c.complete)))
    if (old !== undefined && old.phase !== 'complete'
      && (old.phase !== 'active' || (old.activation !== 'armed' && !completedGroup)))
      throw new ProgressError('paused, blocked or disarmed Goal requires a direct human resume')
    pending.set(agent, objective)
    let goal: GoalView
    try {
      if (old?.phase === 'active' && completedGroup) ctx.goals.complete(agent, old)
      goal = old === undefined || old.phase === 'complete' || completedGroup
        ? ctx.goals.create(agent, { objective }) : ctx.goals.edit(agent, old, { objective })
      ctx.longTermProgress.change(agent, ref, { kind: 'bind-goal', binding: {
        goal: { id: goal.id, revision: goal.revision }, milestoneId: request.milestoneId, checkpointIds: request.checkpointIds,
      } }, { kind: 'maintenance' })
    } catch (error) {
      ctx.goals.disarm(agent)
      throw error
    } finally { pending.delete(agent) }
    return goal
  }
  ctx.inject(['tools'], (consumer) => {
    consumer.tools.guard((exec) => {
      if (exec.agent === undefined || !consumer.sessionProjections.stateOf(exec.agent.session, 'longTermProgressContext')?.needsReview)
        return undefined
      const view = consumer.longTermProgress.get(exec.agent)
      if (view === null || view.milestones.length === 0) return undefined
      if (['read_progress', 'update_progress', 'get_goal', 'update_goal', 'ask_user_question'].includes(exec.name)) return undefined
      return 'Reconcile recent checkpoint evidence with update_progress, or record review before implementation tools. Use recent context, not a broad audit.'
    })
    const schema = z.object({ revision: z.number().int().nonnegative(), milestone_id: z.string(),
      checkpoint_ids: z.array(z.string()).min(1), objective: z.string() }).strict()
    consumer.tools.register(defineTool({
      name: 'advance_progress_goal',
      description: 'Advance the existing execution Goal within the freshly released milestone, covering a consecutive unfinished checkpoint group. '
        + 'Never skips predecessors, crosses a milestone boundary, resumes paused work or treats a completed Goal as checkpoint evidence.',
      parameters: { revision: { type: 'integer', required: true }, milestone_id: { type: 'string', required: true },
        checkpoint_ids: { type: 'array', required: true, items: { type: 'string' } }, objective: { type: 'string', required: true } },
      output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
      execute(_args, exec) {
        const args = schema.parse(exec.arguments)
        const goal = consumer.longTermProgress.advanceGoal(progressToolAgent(consumer, exec), args, {
          milestoneId: milestoneId(args.milestone_id), checkpointIds: args.checkpoint_ids.map(checkpointId), objective: args.objective,
        })
        return Promise.resolve({ goal: { id: goal.id, revision: goal.revision, objective: goal.objective } })
      },
      presentCall: args => ({ card: 'generic', title: 'Advance milestone Goal', kind: 'other', rawInput: args.objective }),
    }))
  })
  ctx.effect(() => () => {
    for (const agent of activeReleases.keys())
      if (ctx.agents.get(agent.id) === agent) ctx.goals.disarm(agent)
    activeReleases.clear()
  })
  return advance
}
