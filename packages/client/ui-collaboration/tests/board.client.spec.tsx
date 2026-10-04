// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Board } from '../src/client/Board.tsx'
import type { BoardProps } from '../src/client/types.ts'
import { props, snapshot } from './fixtures.client.ts'

afterEach(cleanup)
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

it('renders pair grants, explicit charged budget and delivered discussion without task controls', () => {
  const p = props(true)
  render(<Board {...p as unknown as BoardProps} />)
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
  render(<Board {...p as unknown as BoardProps} />)
  expect((screen.getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true)
  expect((screen.getAllByLabelText('Automatic activation limit')[0] as HTMLInputElement).value).toBe('')
  expect(screen.getByText(/share OS credentials/u)).toBeTruthy()
})

it('keeps malicious message bodies as inert text and reports missing Git observations', () => {
  const p = props(true)
  p.useCollaboration = select => select({ view: { ...snapshot, outbox: [{ ...snapshot.outbox[0], text: '<script>unsafe()</script>' }] }, phase: 'ready', error: null })
  const { container } = render(<Board {...p as unknown as BoardProps} />)
  expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getAllByText('Not observed').length).toBeGreaterThan(0)
})

it('advances only the viewed connection reading position and reads incoming additions while open', () => {
  const p = props(true)
  const second = { ...snapshot.connections[0], id: 'second-pair', sessions: ['a', 'c'] }
  const view = { ...snapshot, connections: [...snapshot.connections, second], outbox: [
    ...snapshot.outbox, { ...snapshot.outbox[0], id: 'second-message', connectionId: 'second-pair', sender: 'c' },
  ] }
  p.useCollaboration = select => select({ view, phase: 'ready', error: null })
  const { rerender } = render(<Board {...p as unknown as BoardProps} />)
  expect(p.actions.read).toHaveBeenCalledWith('pair', 'message')
  expect(p.actions.read).not.toHaveBeenCalledWith('second-pair', 'second-message')
  p.state.readThrough.pair = 'message'
  p.state.selected = 'second-pair'
  rerender(<Board {...p as unknown as BoardProps} />)
  expect(p.actions.read).toHaveBeenCalledWith('second-pair', 'second-message')
  p.state.readThrough['second-pair'] = 'second-message'
  p.actions.read.mockClear()
  p.useCollaboration = select => select({ view: { ...view, revision: 8, outbox: [...view.outbox,
    { ...view.outbox[1], id: 'second-new' }, { ...view.outbox[0], id: 'first-new' },
  ] }, phase: 'ready', error: null })
  rerender(<Board {...p as unknown as BoardProps} />)
  expect(p.actions.read).toHaveBeenCalledExactlyOnceWith('second-pair', 'second-new')
  p.state.open = false
  p.actions.read.mockClear()
  rerender(<Board {...p as unknown as BoardProps} />)
  expect(p.actions.read).not.toHaveBeenCalled()
})
