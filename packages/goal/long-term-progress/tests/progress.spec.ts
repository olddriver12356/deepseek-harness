import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import SessionStore, { SessionId, type Session } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import LongTermProgress from '../src/index.ts'
import { checkpointId, milestoneId } from '../src/domain.ts'
import type { ProgressChange, ProgressView } from '../src/types.ts'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse())
  await cleanup() })
const human = { kind: 'human', source: 'command' } as const
const maintenance = { kind: 'maintenance' } as const
const m1 = milestoneId('m1'), m2 = milestoneId('m2'), c1 = checkpointId('c1'), c2 = checkpointId('c2')
const milestones = [
  { id: m1,
    title: 'First',
    caption: 'First caption',
    exitCondition: 'Pass',
    references: ['spec.md'],
    checkpoints: [{ id: c1,
      outcome: 'Pass tests',
      detail: '',
      references: [] }] },

  { id: m2,
    title: 'Second',
    caption: 'Second caption',
    exitCondition: 'Pass',
    references: [],
    checkpoints: [{ id: c2,
      outcome: 'Ship',
      detail: '',
      references: [] }] },

]
async function harness() {
  const ctx = new Context()
  for (const plugin of [SessionStore, SessionProjectionRegistry, AgentRegistry]) {
    const mounted = ctx.plugin(plugin)
    await mounted
    cleanups.push(() => mounted.dispose())
  }
  const fiber = ctx.plugin(LongTermProgress)
  await fiber
  cleanups.push(() => fiber.dispose())
  async function register(session: Session): Promise<Agent> {
    const agent: Agent = { id: session.id,
      ctx,
      session,
      options: {},
      inbox: createInboxStub(),
      status: 'idle',
      send() { },
      wake() { },
      followup() { },
      steer() { },
      inject(input) { this.inbox.append('next-step',
        input) },
      cancel() { },
      runMaintenance: task => task(new AbortController().signal),
      whenIdle: async () => { } }
    await ctx.agents.register(agent)
    return agent
  }
  const agent = await register(ctx.sessions.create(SessionId(randomUUID())))
  const change = (action: ProgressChange) => ctx.longTermProgress.change(agent,
    { revision: ctx.longTermProgress.get(agent)?.revision ?? 0 },
    action,
    human)
  return { ctx, agent, change, register, fiber }
}
describe('durable progress service', () => {
  it('appends before publishing and preserves state when append fails', async () => {
    const { ctx, agent, change } = await harness()
    expect(ctx.longTermProgress.get(agent)).toBeNull()
    change({ kind: 'replace', milestones })
    const before = ctx.longTermProgress.get(agent)
    const append = vi.spyOn(agent.session, 'append').mockImplementation(() => { throw new Error('disk failed') })
    expect(() => change({ kind: 'approve', milestoneId: m1 })).toThrow('disk failed')
    expect(ctx.longTermProgress.get(agent)).toEqual(before)
    append.mockRestore()
    change({ kind: 'approve', milestoneId: m1 })
    expect(agent.session.snapshotEvents().map(e => e.type)).toEqual(['progress/change', 'progress/change'])
    expect(agent.inbox.nextStep).toEqual([])
  })
  it('rejects concurrent stale edits and replays without arming execution', async () => {
    const { ctx, agent, change, register } = await harness()
    const state = change({ kind: 'replace', milestones })
    change({ kind: 'approve', milestoneId: m1 })
    expect(() => ctx.longTermProgress.change(agent, state, { kind: 'start', milestoneId: m1 }, human)).toThrow(/stale/)
    const released = change({ kind: 'start', milestoneId: m1 })
    const reopened = await register(ctx.sessions.create(SessionId(randomUUID()), { seed: agent.session.snapshotEvents() }))
    expect(ctx.longTermProgress.get(reopened)).toEqual(released)
    expect(reopened.inbox.nextStep).toEqual([])
  })
  it('forks references and suspends only child vault writeback', async () => {
    const { ctx, agent, change, register } = await harness()
    change({ kind: 'replace', milestones })
    change({ kind: 'vault-link',
      binding: { path: 'checklist.md',
        fingerprint: 'v1',
        mapping: [{ checkpointId: c1,
          marker: 'stable-c1' }],
        allowTextRefinement: false,
        writeback: 'confirmed',
        settlement: 'synchronized',
        message: '' } })
    change({ kind: 'vault-settle', fingerprint: 'v2', settlement: 'pending', message: 'Queued write' })
    const child = await register(ctx.sessions.fork(agent.session))
    expect(ctx.longTermProgress.get(child)?.milestones[0]?.references).toEqual(['spec.md'])
    expect(ctx.longTermProgress.get(child)?.vault?.writeback).toBe('suspended')
    expect(ctx.longTermProgress.get(agent)?.vault?.writeback).toBe('confirmed')
    expect(() => ctx.longTermProgress.change(child,
      { revision: 3 },
      { kind: 'vault-settle',
        fingerprint: 'v2',
        settlement: 'synchronized',
        message: '' },
      maintenance)).toThrow(/confirmed/)
  })
  it('reopens a failing current checkpoint only with concrete failed evidence and retains history', async () => {
    const { ctx, agent, change } = await harness()
    change({ kind: 'replace', milestones })
    change({ kind: 'reconcile', checkpointId: c1, evidence: { kind: 'passed', summary: 'Tests passed', references: ['run 1'] } })
    expect(() => change({ kind: 'reconcile', checkpointId: c1, evidence: { kind: 'failed', summary: '', references: [] } })).toThrow()
    change({ kind: 'reconcile',
      checkpointId: c1,
      evidence: { kind: 'failed',
        summary: 'Regression reproduced',
        references: ['run 2'] } })
    expect(ctx.longTermProgress.get(agent)?.milestones[0]?.checkpoints[0]).toMatchObject({ complete: false,
      evidence: [{ kind: 'passed' },
        { kind: 'failed' }] })
  })
  it('adds a current repair while retaining historical acceptance', async () => {
    const { ctx, agent, change } = await harness()
    change({ kind: 'replace', milestones })
    change({ kind: 'approve', milestoneId: m1 })
    change({ kind: 'reconcile', checkpointId: c1, evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    const accepted = change({ kind: 'accept', milestoneId: m1 })
    change({ kind: 'regression',
      historicalCheckpointId: c1,
      milestoneId: m2,
      checkpoint: { id: checkpointId('repair'),
        outcome: 'Regression test and repair verified',
        detail: 'Add regression test, patch, verify',
        references: [] },
      insertAt: 0,
      reason: 'Shipping depends on failed functionality',
      evidence: { kind: 'failed',
        summary: 'Reproduced failure',
        references: ['failed run'] } })
    expect(ctx.longTermProgress.get(agent)?.acceptances).toEqual(accepted.acceptances)
    expect(ctx.longTermProgress.get(agent)?.milestones[1]?.checkpoints.map(c => c.id)).toEqual(['repair', c2])
  })
  it('rejects corrupt durable events instead of continuing from stale state', async () => {
    const { ctx, agent, change } = await harness()
    const state = change({ kind: 'replace', milestones })
    agent.session.append('progress/change', {
      version: 1, change: { kind: 'replace', milestones }, authority: human, state: { ...state, revision: 99 },
    })
    expect(() => ctx.longTermProgress.get(agent)).toThrow(/replay/)
  })
  it('removes registrations and rejects retained service handles after unload, then replays on reload', async () => {
    const { ctx, agent, change, fiber } = await harness()
    const state: ProgressView = change({ kind: 'replace', milestones })
    const old = ctx.longTermProgress
    await fiber.dispose()
    expect(ctx.sessionProjections.stateOf(agent.session, 'longTermProgress')).toBeUndefined()
    expect(() => old.change(agent, { revision: state.revision }, { kind: 'approve', milestoneId: m1 }, human)).toThrow(/disposed/)
    await ctx.plugin(LongTermProgress)
    expect(ctx.longTermProgress.get(agent)).toEqual(state)
  })
})
