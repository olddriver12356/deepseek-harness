// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ProgressProjectionView, ProgressView } from '@deepseek-ai/dsh-long-term-progress/types'
import { ProgressSection } from '../src/client/ProgressSection.tsx'
import { en } from '../src/client/locales.ts'
import type { ProgressActions } from '../src/client/ProgressSection.tsx'
const milestones: ProgressView['milestones'] = [{ id: 'm1' as ProgressView['milestones'][number]['id'],
  title: 'Foundation', caption: 'Durable state', exitCondition: 'Verified', references: [], checkpoints: [{
    id: 'c1' as ProgressView['milestones'][number]['checkpoints'][number]['id'], outcome: 'Private checkpoint outcome',
    detail: 'Implementation detail', references: ['plan.md'], complete: false, evidence: [],
  }] }]

afterEach(cleanup)
const current: ProgressView = { revision: 1, milestones,
  approvals: [], release: null, acceptances: [], goalBinding: null, vault: null, references: [] }
function mount(projection: ProgressProjectionView | undefined = { status: 'ready', current }, readOnly = false) {
  const onUpdate = vi.fn<ProgressActions['onUpdate']>(() => Promise.resolve({ ok: true as const, value: current }))
  const props = { projection, readOnly, onUpdate, t: makeTranslate(en) }
  return { ...render(<ProgressSection {...props} />), props, onUpdate }
}
describe('Session long-term progress', () => {
  it('shows an empty list without suggesting execution; saving is separate from approval', () => {
    const h = mount({ status: 'ready', current: null })
    expect(screen.getByText('No milestones yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start milestone' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit milestones' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Milestone draft JSON' }), { target: { value: JSON.stringify(milestones) } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(h.onUpdate).toHaveBeenCalledWith({ revision: 0 }, { kind: 'replace', milestones })
  })
  it('keeps checkpoints and evidence on demand; approve and start are distinct actions', () => {
    const h = mount()
    expect(screen.getByText('Durable state')).toBeTruthy()
    expect(screen.queryByText('Private checkpoint outcome')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Foundation/ }))
    expect(screen.getByText('Private checkpoint outcome')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Approve scope' }))
    expect(h.onUpdate).toHaveBeenCalledWith({ revision: 1 }, { kind: 'approve', milestoneId: milestones[0]!.id })
    expect(screen.queryByRole('button', { name: 'Start milestone' })).toBeNull()
  })
  it('retains last-good rows and disables authority while replay is untrusted', () => {
    mount({ status: 'untrusted', current, failure: { code: 'PROGRESS_REPLAY_FAILED', eventSeq: 3, message: 'Invalid progress event' } })
    expect(screen.getByRole('alert').textContent).toContain('Invalid progress event')
    expect(screen.getByText('Foundation')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit milestones' })).toHaveProperty('disabled', true)
  })
  it('single-flights updates and retains stale errors with existing rows', async () => {
    const h = mount()
    const pending = Promise.withResolvers<Awaited<ReturnType<ProgressActions['onUpdate']>>>()
    h.onUpdate.mockImplementation(() => pending.promise)
    fireEvent.click(screen.getByRole('button', { name: /Foundation/ }))
    const approve = screen.getByRole('button', { name: 'Approve scope' })
    act(() => { approve.click(); approve.click() })
    expect(h.onUpdate).toHaveBeenCalledTimes(1)
    expect(approve).toHaveProperty('disabled', true)
    await act(async () => { pending.resolve({ ok: false, error: { code: 'gateway/internal', message: 'stale progress revision', details: {} } }) })
    expect(screen.getByRole('alert').textContent).toContain('stale progress revision')
    expect(screen.getByText('Foundation')).toBeTruthy()
  })
  it('starts only an approved current milestone and keeps acceptance separate from next release', async () => {
    const m1 = milestones[0]!
    const m2 = { ...m1, id: 'm2' as typeof m1.id, title: 'Delivery', caption: 'Ship verified work' }
    const approved = { ...current, revision: 2, approvals: [{ milestoneId: m1.id, revision: 2 }] }
    const h = mount({ status: 'ready', current: approved })
    fireEvent.click(screen.getByRole('button', { name: /Foundation/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Start milestone' }))
    expect(h.onUpdate).toHaveBeenCalledWith({ revision: 2 }, { kind: 'start', milestoneId: m1.id })
    await act(async () => {})
    h.rerender(<ProgressSection {...h.props} projection={{ status: 'ready', current: { ...approved,
      milestones: [{ ...m1, checkpoints: m1.checkpoints.map(c => ({ ...c, complete: true, evidence: [{
        revision: 3, kind: 'passed', summary: 'Verified against acceptance', references: ['test-run'],
      }] })) }, m2] } }} />)
    expect(screen.getByRole('button', { name: 'Accept milestone' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Release next milestone' })).toBeNull()
    fireEvent.click(screen.getByText('Evidence and references'))
    expect(screen.getByText('Passed: Verified against acceptance')).toBeTruthy()
    h.rerender(<ProgressSection {...h.props} projection={{ status: 'ready', current: { ...approved,
      milestones: [m1, m2], acceptances: [{ milestoneId: m1.id, revision: 4 }],
      approvals: [...approved.approvals, { milestoneId: m2.id, revision: 5 }],
    } }} />)
    fireEvent.click(screen.getByRole('button', { name: /Delivery/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Release next milestone' }))
    expect(h.onUpdate).toHaveBeenLastCalledWith({ revision: 2 }, { kind: 'start', milestoneId: m2.id })
  })
  it('shows pending writeback and respects externally pending interaction read-only state', () => {
    mount({ status: 'ready', current: { ...current, vault: { targetKey: 'file', path: 'checklist.md', fingerprint: 'one', mapping: [],
      allowTextRefinement: false, writeback: 'confirmed', settlement: 'pending', message: 'Waiting for write' } } }, true)
    expect(screen.getByText('Checklist: pending')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit milestones' })).toHaveProperty('disabled', true)
  })
})
