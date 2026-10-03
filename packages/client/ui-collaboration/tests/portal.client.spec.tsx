// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { Portal } from '../src/client/Portal.tsx'
import { zh } from '../src/client/locales.ts'
import { props, snapshot, peer } from './fixtures.ts'

afterEach(cleanup)

it('shows an inactive but reachable connection and opens discussion details', () => {
  const p = props()
  render(<Portal {...p as never} />)
  expect(screen.getByText('Reviewer')).toBeTruthy()
  expect(screen.getByText('Inactive · reachable')).toBeTruthy()
  expect(screen.getByText('/repo/review')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Reviewer/u }))
  expect(p.actions.open).toHaveBeenCalledWith('pair')
  expect(screen.queryByRole('button', { name: /Approve|Enroll|Execute/u })).toBeNull()
})

it('surfaces Remote failure and offers refresh without inventing availability', () => {
  const p = props()
  p.useCollaboration = select => select({ view: null, phase: 'failed', error: 'session unavailable' })
  render(<Portal {...p as never} />)
  expect(screen.getByRole('alert').textContent).toContain('session unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(p.refresh).toHaveBeenCalledOnce()
})

it('follows live Session running changes without a collaboration revision change', () => {
  const p = props()
  p.useCollaboration = select => select({ view: { ...snapshot, observations: [{ sessionId: peer, availability: 'inactive', git: { kind: 'unavailable' } }] }, phase: 'ready', error: null })
  const { rerender } = render(<Portal {...p as never} />)
  expect(screen.getByText('Inactive · reachable')).toBeTruthy()
  const readSessions = p.useSessions
  p.useSessions = select => readSessions((value) => {
    const sessions = value as { byId: { b: { running: boolean } } }
    return select({ ...sessions, byId: { ...sessions.byId, b: { ...sessions.byId.b, running: true } } })
  })
  rerender(<Portal {...p as never} />)
  expect(screen.getByText('Active')).toBeTruthy()
  expect(screen.queryByText('Inactive · reachable')).toBeNull()
  p.useSessions = readSessions
  rerender(<Portal {...p as never} />)
  expect(screen.getByText('Inactive · reachable')).toBeTruthy()
})

it.each(['missing', 'unknown'])('preserves %s availability without a live Session row', (availability) => {
  const p = props()
  p.useSessions = select => select({ ids: [], phase: 'ready', byId: {} })
  p.useCollaboration = select => select({ view: { ...snapshot, observations: [{ sessionId: peer, availability, git: { kind: 'unavailable' } }] }, phase: 'ready', error: null })
  render(<Portal {...p as never} />)
  expect(screen.getByText('Availability unknown')).toBeTruthy()
  expect(screen.queryByText('Inactive · reachable')).toBeNull()
})

it('localizes the unread indication in Chinese', () => {
  const p = props()
  p.t = makeTranslate(zh)
  render(<Portal {...p as never} />)
  expect(screen.getByText('未读消息: 1')).toBeTruthy()
})

it('derives unread incoming messages from each complete replacement and the local reading position', () => {
  const p = props()
  const { rerender } = render(<Portal {...p as never} />)
  expect(screen.getByText('Unread messages: 1')).toBeTruthy()
  p.state.readThrough.pair = 'message'
  rerender(<Portal {...p as never} />)
  expect(screen.queryByText(/Unread messages/u)).toBeNull()
  p.useCollaboration = select => select({ view: { ...snapshot, revision: 9, outbox: [
    ...snapshot.outbox, { ...snapshot.outbox[0], id: 'new-incoming' },
    { ...snapshot.outbox[0], id: 'outgoing', sender: 'a', recipient: peer },
  ] }, phase: 'ready', error: null })
  rerender(<Portal {...p as never} />)
  expect(screen.getByText('Unread messages: 1')).toBeTruthy()
  p.useCollaboration = select => select({ view: { ...snapshot, revision: 10, outbox: [] }, phase: 'ready', error: null })
  rerender(<Portal {...p as never} />)
  expect(screen.queryByText(/Unread messages/u)).toBeNull()
})
