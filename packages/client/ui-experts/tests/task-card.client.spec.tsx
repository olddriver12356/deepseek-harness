// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExpertTaskCard } from '../src/client/ExpertTaskCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
it('opens the exact child, stops it, and does not present admission as completion', async () => {
  const openTask = vi.fn()
  const stopTask = vi.fn(async () => {})
  render(<ExpertTaskCard {...{
    t: (key: keyof typeof en) => en[key], openTask, stopTask,
    useSessions: (select: (state: unknown) => unknown) => select({ byId: {}, subagentsByParent: {} }),
    block: { kind: 'tool-result', isError: false, content: [], call: { argsRaw: JSON.stringify({ expert: 'Reviewer', task: 'Inspect login' }) },
      meta: { expertDelegation: { expert: 'Reviewer', childId: 'child', parentSessionId: 'parent', access: 'read-only', contextMode: 'fresh' } } },
  } as never} />)
  expect(screen.getByText('Delegated; report requires acceptance')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View progress / send follow-up' }))
  expect(openTask).toHaveBeenCalledWith({ childSessionId: 'child', parentSessionId: 'parent', mode: 'continuable' })
  fireEvent.click(screen.getByRole('button', { name: 'Stop current task' }))
  expect(await screen.findByText('Stop requested')).toBeTruthy()
  expect(stopTask).toHaveBeenCalledWith({ childSessionId: 'child', parentSessionId: 'parent', mode: 'continuable' })
})
