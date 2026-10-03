// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Portal } from '../src/client/Portal.tsx'
import { props } from './fixtures.ts'

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
