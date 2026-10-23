import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as GoalDriver from '@deepseek-ai/dsh-goal-round-driver'
import { SessionId } from '@deepseek-ai/dsh-session'
import { LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import LongTermProgress from '../src/index.ts'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import GoalService from '@deepseek-ai/dsh-goal'
import { checkpointId, milestoneId } from '../src/domain.ts'
import { harness, milestones } from './consumer-harness.ts'
import * as ToolGoal from '@deepseek-ai/dsh-tool-goal'

async function scopedHarness() {
  const h = await harness()
  await h.ctx.plugin(GoalService)
  const list = [{ ...milestones[0]!, checkpoints: [milestones[0]!.checkpoints[0]!, {
    id: checkpointId('c1b'), outcome: 'Second outcome', detail: '', references: [],
  }] }, milestones[1]!]
  h.change({ kind: 'replace', milestones: list })
  h.change({ kind: 'approve', milestoneId: milestoneId('m1') })
  h.change({ kind: 'start', milestoneId: milestoneId('m1') })
  h.open()
  return h
}

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  onRequest?: () => void
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    this.onRequest?.()
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Done' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

async function realHarness() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await mountAgentLoopTestDependencies(ctx)
  await ctx.plugin(GoalService)
  await ctx.plugin(GoalDriver)
  await ctx.plugin(AgentLoop, { agents: [] })
  const progress = ctx.plugin(LongTermProgress)
  await progress
  const adapter = new RecordingAdapter()
  ctx.llm.registerAdapter(['mock'], adapter)
  const agent = await ctx.agentLoop.create(SessionId(randomUUID()), { provider: 'mock', model: 'mock' })
  const change = (action: import('../src/types.ts').ProgressChange) => ctx.longTermProgress.change(agent,
    { revision: ctx.longTermProgress.get(agent)?.revision ?? 0 }, action, { kind: 'human', source: 'command' })
  change({ kind: 'replace', milestones })
  change({ kind: 'approve', milestoneId: milestoneId('m1') })
  change({ kind: 'start', milestoneId: milestoneId('m1') })
  return { ctx, adapter, agent, change, progress }
}

describe('released progress Goal scope', () => {
  it.each(['completed', 'replaced', 'paused'] as const)('refuses reserved continuation when scope is %s during an awaited admission hook', async (mode) => {
    const h = await realHarness()
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()
    h.ctx.on('agent/pre-step', async (_input, next) => {
      entered.resolve(undefined)
      await release.promise
      return next()
    })
    const goal = h.ctx.longTermProgress.advanceGoal(h.agent, { revision: 3 }, {
      milestoneId: milestoneId('m1'), checkpointIds: [checkpointId('c1')], objective: 'Implement foundation',
    })
    await entered.promise
    if (mode === 'completed') h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'),
      evidence: { kind: 'passed', summary: 'Verified', references: ['run'] } })
    if (mode === 'replaced') h.change({ kind: 'replace', milestones })
    if (mode === 'paused') h.ctx.goals.pause(h.agent, goal)
    release.resolve(undefined)
    await h.agent.whenIdle()
    expect(h.adapter.requests).toHaveLength(0)
    expect(h.ctx.goals.get(h.agent)?.activation).toBe('disarmed')
  })

  it('stops a completed Goal group before unrelated unfinished checkpoints and disarms on unload', async () => {
    const h = await scopedHarness()
    const result = await h.tool('advance_progress_goal', {
      revision: 3, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Implement first checkpoint',
    })
    expect(result.isError).toBe(false)
    const goal = h.ctx.goals.get(h.agent)
    if (goal === undefined) throw new Error('Goal is missing')
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'),
      evidence: { kind: 'passed', summary: 'Verified', references: ['run'] } })
    expect(h.ctx.goals.canContinue(h.agent, goal)).toBe(false)
    await h.fiber.dispose()
    expect(h.ctx.goals.get(h.agent)?.activation).toBe('disarmed')
  })

  it('requires lightweight evidence reconciliation after a Goal switch before advancing again', async () => {
    const h = await scopedHarness()
    expect((await h.tool('advance_progress_goal', {
      revision: 3, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Partial implementation',
    })).isError).toBe(false)
    expect((await h.tool('advance_progress_goal', {
      revision: 4, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Premature switch',
    })).isError).toBe(true)
    expect((await h.tool('update_progress', { revision: 4, change: {
      kind: 'review', reason: 'No new evidence; the previous Goal covered only part of this checkpoint.',
    } })).isError).toBe(false)
    expect(h.ctx.longTermProgress.get(h.agent)?.milestones[0]?.checkpoints[0]?.complete).toBe(false)
    expect((await h.tool('advance_progress_goal', {
      revision: 5, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Remaining work',
    })).isError).toBe(false)
  })

  it('advances to the next eligible group after the driver disarms a completed group', async () => {
    const h = await scopedHarness()
    expect((await h.tool('advance_progress_goal', { revision: 3, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'First group' })).isError).toBe(false)
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    h.ctx.goals.disarm(h.agent)
    expect((await h.tool('advance_progress_goal', { revision: 5, milestone_id: 'm1', checkpoint_ids: ['c1b'], objective: 'Next group' })).isError).toBe(false)
    expect(h.ctx.goals.get(h.agent)?.activation).toBe('armed')
  })

  it('does not block ordinary no-list tools after an unrelated Goal change', async () => {
    const h = await harness()
    await h.ctx.plugin(GoalService)
    h.ctx.tools.register(defineContentToolFixture({ name: 'tick', description: 'Read observed state', parameters: {},
      async execute() { return [{ type: 'text', text: 'ok' }] } }))
    h.ctx.goals.create(h.agent, { objective: 'Ordinary task' })
    h.open()
    expect((await h.tool('tick', {})).isError).toBe(false)
  })

  it('keeps an admitted Goal turn able to finish bookkeeping after completing its execution Goal', async () => {
    const h = await realHarness()
    const entered = Promise.withResolvers<undefined>()
    h.adapter.onRequest = () => {
      const current = h.ctx.goals.get(h.agent)
      if (current === undefined) throw new Error('Goal is missing')
      h.ctx.goals.complete(h.agent, current)
      entered.resolve(undefined)
    }
    h.ctx.longTermProgress.advanceGoal(h.agent, { revision: 3 }, {
      milestoneId: milestoneId('m1'), checkpointIds: [checkpointId('c1')], objective: 'Partial implementation',
    })
    await entered.promise
    await h.agent.whenIdle()
    expect(h.adapter.requests).toHaveLength(1)
    const messages = h.agent.session.snapshotEvents().flatMap(e => e.type === 'user/message' && e.data.source.kind === 'goal' ? [e.data] : [])
    expect(h.ctx.agents.acceptsInput(h.agent, messages)).toBe(false)
  })

  it('preserves ordinary Goal tools direct-human restrictions during automatic turns', async () => {
    const h = await scopedHarness()
    await h.ctx.plugin(ToolGoal, {})
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    h.open(2, false)
    expect((await h.tool('create_goal', { objective: 'Bypass progress' })).isError).toBe(true)
    const result = await h.tool('advance_progress_goal', { revision: 3, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Approved group' })
    expect(result.isError).toBe(false)
    const goal = h.ctx.goals.get(h.agent)
    if (goal === undefined) throw new Error('Goal is missing')
    expect((await h.tool('update_goal', { goal_id: goal.id, revision: goal.revision, action: 'edit', objective: 'Unrelated' })).isError).toBe(true)
    expect((await h.tool('update_goal', { goal_id: goal.id, revision: goal.revision, action: 'resume' })).isError).toBe(true)
  })

  it('does not inherit process-local release after plugin reload', async () => {
    const h = await realHarness()
    await h.progress.dispose()
    await h.ctx.plugin(LongTermProgress)
    expect(() => h.ctx.longTermProgress.advanceGoal(h.agent, { revision: 3 }, {
      milestoneId: milestoneId('m1'), checkpointIds: [checkpointId('c1')], objective: 'Hidden restart',
    })).toThrow(/fresh human start|resume/)
    expect(h.adapter.requests).toHaveLength(0)
  })
  it('binds consecutive checkpoints through a narrow tool and rejects ordinary unrelated Goals centrally', async () => {
    const h = await scopedHarness()
    expect(() => h.ctx.goals.create(h.agent, { objective: 'Unrelated work' })).toThrow(/progress|milestone/)
    const result = await h.tool('advance_progress_goal', {
      revision: 3, milestone_id: 'm1', checkpoint_ids: ['c1', 'c1b'], objective: 'Implement approved foundation',
    })
    expect(result.isError).toBe(false)
    const goal = h.ctx.goals.get(h.agent)
    expect(goal?.objective).toBe('Implement approved foundation')
    expect(h.ctx.longTermProgress.get(h.agent)?.goalBinding).toMatchObject({
      goal: { id: goal?.id, revision: goal?.revision }, milestoneId: 'm1', checkpointIds: ['c1', 'c1b'],
    })
    expect(() => h.ctx.goals.edit(h.agent, goal!, { objective: 'Unrelated work' })).toThrow(/progress|milestone/)
  })

  it('cannot skip predecessors, cross milestones, or turn passive evidence into execution permission', async () => {
    const h = await scopedHarness()
    for (const ids of [['c1b'], ['c1', 'c2']]) expect((await h.tool('advance_progress_goal', {
      revision: 3, milestone_id: 'm1', checkpoint_ids: ids, objective: 'Skip scope',
    })).isError).toBe(true)
    expect((await h.tool('update_progress', { revision: 3, change: { kind: 'reconcile', checkpointId: 'c2',
      evidence: { kind: 'passed', summary: 'Already delivered', references: ['delivery-run'] } } })).isError).toBe(false)
    expect(h.ctx.longTermProgress.get(h.agent)?.milestones[1]?.checkpoints[0]?.complete).toBe(true)
    expect((await h.tool('advance_progress_goal', { revision: 4, milestone_id: 'm2', checkpoint_ids: ['c2'], objective: 'Ship' })).isError).toBe(true)
  })

  it('allows several Goals for partial checkpoint work without marking it complete; human pause wins', async () => {
    const h = await scopedHarness()
    const first = await h.tool('advance_progress_goal', { revision: 3, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'First part' })
    expect(first.isError).toBe(false)
    const goal = h.ctx.goals.get(h.agent)!
    h.ctx.goals.complete(h.agent, goal)
    expect(h.ctx.longTermProgress.get(h.agent)?.milestones[0]?.checkpoints[0]?.complete).toBe(false)
    expect((await h.tool('update_progress', { revision: 4, change: { kind: 'review', reason: 'Partial implementation only' } })).isError).toBe(false)
    expect((await h.tool('advance_progress_goal', { revision: 5, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Remaining part' })).isError).toBe(false)
    const second = h.ctx.goals.get(h.agent)!
    h.ctx.goals.pause(h.agent, second)
    expect((await h.tool('advance_progress_goal', { revision: 6, milestone_id: 'm1', checkpoint_ids: ['c1'], objective: 'Bypass pause' })).isError).toBe(true)
    expect(h.ctx.goals.get(h.agent)?.phase).toBe('paused')
  })
})
