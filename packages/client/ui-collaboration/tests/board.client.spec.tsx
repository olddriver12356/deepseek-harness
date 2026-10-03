// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { Board } from '../src/client/Board.tsx'
import { props, snapshot } from './fixtures.ts'

afterEach(cleanup)
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})

it('renders pair grants, explicit charged budget and delivered discussion without task controls', () => {
  const p = props(true)
  render(<Board {...p as never} />)
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
  render(<Board {...p as never} />)
  expect((screen.getByRole('button', { name: 'Connect' })).disabled).toBe(true)
  expect((screen.getAllByLabelText('Automatic activation limit')[0] as HTMLInputElement).value).toBe('')
  expect(screen.getByText(/share OS credentials/u)).toBeTruthy()
})

it('keeps malicious message bodies as inert text and reports missing Git observations', () => {
  const p = props(true)
  p.useCollaboration = select => select({ view: { ...snapshot, outbox: [{ ...snapshot.outbox[0], text: '<script>unsafe()</script>' }] }, phase: 'ready', error: null })
  const { container } = render(<Board {...p as never} />)
  expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.getAllByText('Not observed').length).toBeGreaterThan(0)
})
