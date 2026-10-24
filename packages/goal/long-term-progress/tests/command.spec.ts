import { describe, expect, it, vi } from 'vitest'
import { harness, milestones } from './consumer-harness.ts'
import { checkpointId } from '../src/domain.ts'

describe('long-goal command', () => {
  it('executes the source-owned status and draft examples without saving progress', async () => {
    for (const locale of ['en', 'zh'] as const) {
      const h = await harness()
      const followup = vi.spyOn(h.agent, 'followup')
      const guide = h.ctx.commands.reference(h.agent, 'long-goal', locale)
      expect(guide).not.toBeNull()
      for (const example of guide!.examples) {
        const execution = await h.ctx.commands.execute(h.agent, example.input, [], new AbortController().signal)
        expect(execution?.result.kind).toBe('success')
      }
      expect(h.ctx.longTermProgress.get(h.agent)).toBeNull()
      expect(followup).toHaveBeenCalledTimes(1)
    }
  })

  it('queues a natural-language proposal for the receiving Agent without saving or releasing scope', async () => {
    const h = await harness()
    const followup = vi.spyOn(h.agent, 'followup')
    const result = await h.command('draft 0 Build a budgeting app\nwith imports and monthly reports.')
    expect(result.kind).toBe('success')
    expect(h.ctx.longTermProgress.get(h.agent)).toBeNull()
    expect(followup).toHaveBeenCalledTimes(1)
    const message = followup.mock.calls[0]![0]
    expect(message.source.kind).toBe('user')
    expect(JSON.stringify(message.content)).toContain('Build a budgeting app\\nwith imports and monthly reports.')
    expect(JSON.stringify(message.content)).toContain('revision 0')
    expect(JSON.stringify(message.content)).toContain('update_progress')
    expect(JSON.stringify(message.content)).toContain('confirmation')
    expect(h.session.snapshotEvents().some(event => event.type === 'progress/change')).toBe(false)
  })

  it('rejects stale, invalid or missing proposal revisions before waking the Agent', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    const followup = vi.spyOn(h.agent, 'followup')
    for (const input of ['draft 0 Make a new plan', 'draft 9007199254740992 Make a plan', 'draft 1', 'draft 1   ']) {
      expect(await h.command(input)).toMatchObject({ kind: 'error' })
    }
    expect(followup).not.toHaveBeenCalled()
    expect(h.ctx.longTermProgress.get(h.agent)?.revision).toBe(1)
  })

  it('refuses to save a proposal when progress changed during discussion', async () => {
    const h = await harness()
    await h.command('draft 0 Build a budgeting app')
    h.change({ kind: 'replace', milestones })
    h.open()
    const questions = vi.fn()
    h.ctx.on('user-questions/request', questions)
    const result = await h.tool('update_progress', { revision: 0, change: { kind: 'replace', milestones } })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('stale')
    expect(questions).not.toHaveBeenCalled()
    expect(h.ctx.longTermProgress.get(h.agent)?.revision).toBe(1)
  })

  it('keeps proposed milestones unsaved until the exact tool confirmation succeeds', async () => {
    const h = await harness()
    await h.command('draft 0 Build a budgeting app')
    h.open()
    const entered = Promise.withResolvers<undefined>()
    const answer = Promise.withResolvers<import('@deepseek-ai/dsh-user-questions').AskUserQuestionAnswer>()
    h.ctx.on('user-questions/request', () => { entered.resolve(undefined); return answer.promise })
    const saving = h.tool('update_progress', { revision: 0, change: { kind: 'replace', milestones } })
    await entered.promise
    expect(h.ctx.longTermProgress.get(h.agent)).toBeNull()
    answer.resolve({ answers: [{ id: 'progress-change', selected: ['Confirm'] }] })
    expect((await saving).isError).toBe(false)
    expect(h.ctx.longTermProgress.get(h.agent)).toMatchObject({ revision: 1, approvals: [], release: null })
  })

  it('shows saved proposals, approves, releases and accepts without scheduling execution', async () => {
    const h = await harness()
    const empty = await h.command()
    expect(empty.kind).toBe('success')
    expect(empty.text).toContain('No long-term progress')
    h.change({ kind: 'replace', milestones })
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

  it('treats JSON-looking descriptions as proposals rather than bypassing confirmation', async () => {
    const h = await harness()
    expect(await h.command(`draft 0 ${JSON.stringify(milestones)}`)).toMatchObject({ kind: 'success' })
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
