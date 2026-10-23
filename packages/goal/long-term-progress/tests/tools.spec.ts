import { describe, expect, it } from 'vitest'
import { harness, milestones } from './consumer-harness.ts'
import { milestoneId } from '../src/domain.ts'

describe('progress tools', () => {
  it('reads compact state by default and only selected details on demand', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    h.open()
    const compact = await h.tool('read_progress', {})
    expect(compact.isError).toBe(false)
    const text = JSON.stringify(compact.value)
    expect(text).toContain('Durable state')
    expect(text).toContain('Ship verified work')
    expect(text).not.toContain('Private checkpoint')
    expect(text).not.toContain('private-spec')
    const selected = await h.tool('read_progress', { milestone_id: 'm1', checkpoint_id: 'c1' })
    expect(selected.isError).toBe(false)
    expect(JSON.stringify(selected.value)).toContain('Private implementation')
    expect(JSON.stringify(selected.value)).not.toContain('Private shipping')
    expect((await h.tool('read_progress', { milestone_id: 'm2', checkpoint_id: 'c1' })).isError).toBe(true)
  })

  it('confirms structural mutations even in a human turn; model JSON cannot grant approval', async () => {
    const h = await harness()
    h.open()
    const input = { revision: 0, change: { kind: 'replace', milestones } }
    expect((await h.tool('update_progress', { ...input, authority: { kind: 'human' } })).isError).toBe(true)
    expect(h.ctx.longTermProgress.get(h.agent)).toBeNull()
    const remove = h.ctx.on('user-questions/request', async request => ({ answers: request.questions.map(q => ({ id: q.id, selected: ['Confirm'] })) }))
    expect((await h.tool('update_progress', input)).isError).toBe(false)
    remove()
    expect(h.ctx.longTermProgress.get(h.agent)?.revision).toBe(1)
    expect((await h.tool('update_progress', { revision: 1, change: { kind: 'approve', milestoneId: 'm1' } })).isError).toBe(true)
    expect(h.ctx.longTermProgress.get(h.agent)?.approvals).toEqual([])
  })

  it('rechecks revision after the in-flight answer and rejects stale confirmation', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    h.open(1, false)
    h.ctx.on('user-questions/request', async (request) => {
      h.change({ kind: 'approve', milestoneId: milestoneId('m1') })
      return { answers: request.questions.map(q => ({ id: q.id, selected: ['Confirm'] })) }
    })
    const result = await h.tool('update_progress', { revision: 1, change: { kind: 'start', milestoneId: 'm1' } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('stale')
    expect(h.ctx.longTermProgress.get(h.agent)?.release).toBeNull()
  })

  it('cancels a pending confirmation on disposal and refuses a late answer', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    h.open()
    const entered = Promise.withResolvers<undefined>()
    const answer = Promise.withResolvers<import('@deepseek-ai/dsh-user-questions').AskUserQuestionAnswer>()
    h.ctx.on('user-questions/request', () => { entered.resolve(undefined); return answer.promise })
    const result = h.tool('update_progress', { revision: 1, change: { kind: 'approve', milestoneId: 'm1' } })
    await entered.promise
    await h.fiber.dispose()
    answer.resolve({ answers: [{ id: 'progress-change', selected: ['Confirm'] }] })
    expect((await result).isError).toBe(true)
    expect(h.session.snapshotEvents().filter(e => e.type === 'progress/change')).toHaveLength(1)
  })

  it('records evidence autonomously but cannot invoke internal settlement operations', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    h.open(1, false)
    const evidence = await h.tool('update_progress', { revision: 1, change: {
      kind: 'reconcile', checkpointId: 'c1', evidence: { kind: 'passed', summary: 'Verified test run', references: ['run-1'] },
    } })
    expect(evidence.isError).toBe(false)
    expect(h.ctx.longTermProgress.get(h.agent)?.milestones[0]?.checkpoints[0]?.complete).toBe(true)
    expect((await h.tool('update_progress', { revision: 2, change: { kind: 'vault-settle', fingerprint: 'fake', settlement: 'synchronized', message: '' } })).isError).toBe(true)
    await h.fiber.dispose()
    expect(h.ctx.tools.get('read_progress')).toBeUndefined()
  })
})
