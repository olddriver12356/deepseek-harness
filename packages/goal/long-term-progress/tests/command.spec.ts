import { describe, expect, it } from 'vitest'
import { harness, milestones } from './consumer-harness.ts'
import { checkpointId } from '../src/domain.ts'

describe('long-goal command', () => {
  it('shows, drafts, approves, releases and accepts without scheduling execution', async () => {
    const h = await harness()
    const empty = await h.command()
    expect(empty.kind).toBe('success')
    expect(empty.text).toContain('No long-term progress')
    expect(await h.command(`draft 0 ${JSON.stringify(milestones)}`)).toMatchObject({ kind: 'success' })
    expect(h.ctx.longTermProgress.get(h.agent)).toMatchObject({ revision: 1, release: null, approvals: [] })
    expect(await h.command('start m1 1')).toMatchObject({ kind: 'error' })
    expect(await h.command('approve m1 1')).toMatchObject({ kind: 'success' })
    expect(h.ctx.longTermProgress.get(h.agent)?.release).toBeNull()
    expect(await h.command('start m1 2')).toMatchObject({ kind: 'success' })
    expect(await h.command('accept m1 3')).toMatchObject({ kind: 'error' })
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Tests passed', references: ['run-1'] } })
    expect(await h.command('accept m1 4')).toMatchObject({ kind: 'success' })
    expect(h.ctx.longTermProgress.get(h.agent)).toMatchObject({ revision: 5, release: null, acceptances: [{ milestoneId: 'm1' }] })
    expect(h.agent.inbox.nextStep).toEqual([])
    expect(h.agent.inbox.nextTurn).toEqual([])
  })

  it('rejects malformed drafts and stale explicit revisions without mutation', async () => {
    const h = await harness()
    expect(await h.command('draft 0 {"authority":true}')).toMatchObject({ kind: 'error' })
    expect(h.ctx.longTermProgress.get(h.agent)).toBeNull()
    h.change({ kind: 'replace', milestones })
    const stale = await h.command('approve m1 0')
    expect(stale.kind).toBe('error')
    expect(stale.text).toContain('stale')
    expect(h.ctx.longTermProgress.get(h.agent)?.revision).toBe(1)
    await h.fiber.dispose()
    expect(h.ctx.commands.find(h.agent, 'long-goal')).toBeUndefined()
  })
})
