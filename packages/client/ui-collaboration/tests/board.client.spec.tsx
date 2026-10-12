// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Board } from '../src/client/Board.tsx'
import type { ConnectionId, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { props, snapshot } from './fixtures.client.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en, zh } from '../src/client/locales.ts'

afterEach(cleanup)
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

it('renders pair grants, explicit charged budget and delivered discussion without task controls', () => {
  const p = props(true)
  render(<Board {...p} />)
  expect(screen.getByRole('dialog', { name: 'Discussion connections' })).toBeTruthy()
  expect(screen.getByText('Delivered to inbox')).toBeTruthy()
  expect(screen.getByText('Check the parser')).toBeTruthy()
  expect(screen.getByText('1 / 3')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
  expect(p.control).toHaveBeenCalledWith('pause', 'pair')
  expect(screen.queryByRole('button', { name: /Approve|Enroll|Execute/u })).toBeNull()
})

it('requires accepted disclosure, pair grants and an entered numeric activation limit before connecting', () => {
  const p = props(true)
  render(<Board {...p} />)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Connect' }).disabled).toBe(true)
  expect((screen.getAllByLabelText('Automatic activation limit')[0] as HTMLInputElement).value).toBe('')
  expect(screen.getByText(/share OS credentials/u)).toBeTruthy()
})

it('keeps malicious message bodies as inert text and reports missing Git observations', () => {
  const p = props(true)
  p.useCollaboration = select => select({ view: { ...snapshot, outbox: [{ ...snapshot.outbox[0]!, text: '<script>unsafe()</script>' }] }, phase: 'ready', error: null })
  const { container } = render(<Board {...p} />)
  expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getAllByText('Not observed').length).toBeGreaterThan(0)
})

it('advances only the viewed connection reading position and reads incoming additions while open', () => {
  const p = props(true)
  const second = { ...snapshot.connections[0]!, id: 'second-pair' as ConnectionId, sessions: ['a' as SessionId, 'c' as SessionId] as const }
  const view = { ...snapshot, connections: [...snapshot.connections, second], outbox: [
    ...snapshot.outbox, { ...snapshot.outbox[0]!, id: 'second-message' as typeof snapshot.outbox[number]['id'], connectionId: 'second-pair' as ConnectionId, sender: 'c' as SessionId },
  ] }
  p.useCollaboration = select => select({ view, phase: 'ready', error: null })
  const { rerender } = render(<Board {...p} />)
  expect(p.actions.read).toHaveBeenCalledWith('pair', 'message')
  expect(p.actions.read).not.toHaveBeenCalledWith('second-pair', 'second-message')
  p.state.readThrough.pair = snapshot.outbox[0]!.id
  p.state.selected = 'second-pair' as ConnectionId
  rerender(<Board {...p} />)
  expect(p.actions.read).toHaveBeenCalledWith('second-pair', 'second-message')
  p.state.readThrough['second-pair'] = 'second-message' as typeof snapshot.outbox[number]['id']
  p.actions.read.mockClear()
  p.useCollaboration = select => select({ view: { ...view, revision: 8, outbox: [...view.outbox,
    { ...view.outbox[1]!, id: 'second-new' as typeof snapshot.outbox[number]['id'] }, { ...view.outbox[0]!, id: 'first-new' as typeof snapshot.outbox[number]['id'] },
  ] }, phase: 'ready', error: null })
  rerender(<Board {...p} />)
  expect(p.actions.read).toHaveBeenCalledExactlyOnceWith('second-pair', 'second-new')
  p.state.open = false
  p.actions.read.mockClear()
  rerender(<Board {...p} />)
  expect(p.actions.read).not.toHaveBeenCalled()
})

it.each([en, zh])('shows persistence and configured-provider disclosure before connecting', (dictionary) => {
  const p = props(true)
  render(<Board {...p} t={makeTranslate(dictionary)} />)
  expect(screen.getByText(dictionary.warning)).toBeTruthy()
  expect(screen.getByRole<HTMLButtonElement>('button', { name: dictionary.connect }).disabled).toBe(true)
})

it('localizes owned termination and committed delivery failure for the Chinese view', () => {
  const p = props(true)
  p.useCollaboration = select => select({ view: { ...snapshot, outbox: [{ ...snapshot.outbox[0]!, state: 'failed', deliveryReason: 'recipient-missing' }] },
    phase: 'failed', error: { key: 'followEnded' } })
  render(<Board {...p} t={makeTranslate(zh)} />)
  expect(screen.getByText(zh.followEnded)).toBeTruthy()
  expect(screen.getByText(zh['recipient-missing'])).toBeTruthy()
})
