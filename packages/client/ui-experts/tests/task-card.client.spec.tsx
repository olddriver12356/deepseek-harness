// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ExpertTaskCard } from '../src/client/ExpertTaskCard.tsx'
import { PartialArguments } from '@deepseek-ai/dsh-util-values'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
it('opens the exact child, stops it, and does not present admission as completion', async () => {
  const openTask = vi.fn()
  const stopTask = vi.fn(async () => {})
  render(<ExpertTaskCard {...{
    t: (key: keyof typeof en) => en[key], openTask, stopTask,
    useSessions: (select: (state: unknown) => unknown) => select({ byId: {}, subagentsByParent: {} }),
    block: { kind: 'tool-result', isError: false, content: [], args: PartialArguments.fromText(JSON.stringify({ expert: 'Reviewer', task: 'Inspect login' })),
      meta: { expertDelegation: { expert: 'Reviewer', childId: 'child', parentSessionId: 'parent', access: 'read-only', contextMode: 'fresh' } } },
  } as Parameters<typeof ExpertTaskCard>[0]} />)
  expect(screen.getByText('Delegated; report requires acceptance')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'View progress / send follow-up' }))
  expect(openTask).toHaveBeenCalledWith({ childSessionId: 'child', parentSessionId: 'parent', mode: 'continuable' })
  fireEvent.click(screen.getByRole('button', { name: 'Stop current task' }))
  expect(await screen.findByText('Stop requested')).toBeTruthy()
  expect(stopTask).toHaveBeenCalledWith({ childSessionId: 'child', parentSessionId: 'parent', mode: 'continuable' })
})

it('reads incomplete preparing arguments through the shared lazy reader before dispatch', () => {
  const props = {
    phase: 'preparing',
    t: (key: keyof typeof en) => en[key], openTask: vi.fn(), stopTask: vi.fn(),
    useSessions: (select: (state: unknown) => unknown) => select({ byId: {} }),
    block: { phase: 'preparing', callId: 'expert-call', name: 'dispatch_expert', args: PartialArguments.EMPTY },
  } as Extract<Parameters<typeof ExpertTaskCard>[0], { readonly phase: 'preparing' }>
  const view = render(<ExpertTaskCard {...props} />)
  expect(screen.queryByText('Inspect login')).toBeNull()
  view.rerender(<ExpertTaskCard {...props} block={{ ...props.block, args: PartialArguments.fromText('{"expert":"Reviewer","task":"Inspect login') }} />)
  expect(screen.getByRole('region', { name: 'Reviewer' })).toBeTruthy()
  expect(screen.getByText('Inspect login')).toBeTruthy()
})
