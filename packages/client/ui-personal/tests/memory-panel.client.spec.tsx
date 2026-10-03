// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MemoryPanel, type MemoryApi } from '../src/client/MemoryPanel.tsx'
import { memoryEn } from '../src/client/memory-locales.ts'
import { personalEn } from '../src/client/memory-locales.ts'
import { PersonalPanel } from '../src/client/PersonalPanel.tsx'
afterEach(cleanup)

it('groups episodes by month and facts by source folder while showing real file counts', async () => {
  const modified = '2026-09-20T12:00:00Z'
  const files = [
    { path: 'Episodic/week/2026-08-31.md', title: '2026-08-31', tier: 'episodic' as const, modified },
    { path: 'Episodic/week/2026-09-20.md', title: '2026-09-20', tier: 'episodic' as const, modified },
    { path: 'Semantic/preferences/Editor.md', title: 'Editor', tier: 'semantic' as const, modified },
  ]
  const api: MemoryApi = { list: async () => files, read: async path => ({ path, content: '# Selected document', modified }) }
  const { container } = render(<MemoryPanel api={api} t={key => memoryEn[key]} />)
  await screen.findByText('No records here yet.')
  fireEvent.click(screen.getByRole('button', { name: 'Episodes' }))
  expect(await screen.findByRole('heading', { name: 'Selected document' })).toBeTruthy()
  expect([...container.querySelectorAll('aside h3')].map(el => el.textContent)).toMatchInlineSnapshot(`
    [
      "2026-09",
      "2026-08",
    ]
  `)
  expect(container.querySelector('aside button[aria-current] strong')?.textContent).toBe('2026-09-20')
  expect(screen.getByRole('button', { name: 'Episodes' }).textContent).toBe('Episodes2')
  fireEvent.click(screen.getByRole('button', { name: 'Long-term facts' }))
  expect(screen.getByRole('heading', { name: 'preferences' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Long-term facts' }).textContent).toBe('Long-term facts1')
})

it('opens today, filters source names, reads another tier and refreshes without writing', async () => {
  const modified = '2026-09-20T12:00:00Z'
  const api: MemoryApi = {
    list: vi.fn(async () => [{ path: 'Working Memory.md', title: 'Working Memory', tier: 'working', modified }, { path: 'Semantic/Profile.md', title: 'Profile', tier: 'semantic', modified }]),
    read: vi.fn(async (path: string) => ({ path, content: path === 'Working Memory.md' ? '# Working Memory\nMaintenance contract.\n## Today 2026-09-20\nOwner text.' : '# ' + path + '\nOwner text.', modified })),
  }
  const { container } = render(<MemoryPanel api={api} t={key => memoryEn[key]} />)
  expect(await screen.findByText('Owner text.')).toBeTruthy()
  expect(screen.queryByText('Maintenance contract.')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Source' }))
  expect(container.querySelector('pre')?.textContent).toContain('Maintenance contract.')
  fireEvent.click(screen.getByRole('button', { name: 'Read' }))
  expect([...container.querySelectorAll('nav button')].map(button => button.getAttribute('aria-label'))).toMatchInlineSnapshot(`
    [
      "Today",
      "Episodes",
      "Long-term facts",
      "Handoffs",
      "Open items",
    ]
  `)
  fireEvent.click(screen.getByRole('button', { name: 'Long-term facts' }))
  expect(await screen.findByRole('heading', { name: 'Semantic/Profile.md' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Source' }))
  expect(container.querySelector('pre')?.textContent).toContain('# Semantic/Profile.md')
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } })
  expect(screen.getByText('No records here yet.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(api.list).toHaveBeenCalledTimes(2)
})

it('keeps the original About Me iframe mounted while opening and leaving Memory', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
  try {
    const appPanels = { subscribe: () => () => {}, getSnapshot: () => 'personal' } as never
    const { container } = render(<PersonalPanel appPanels={appPanels} t={key => personalEn[key]} />)
    const frame = container.querySelector('iframe')
    fireEvent.click(screen.getByRole('button', { name: 'Memory' }))
    expect(await screen.findByText('No records here yet.')).toBeTruthy()
    expect(container.querySelector('iframe')).toBe(frame)
    expect(frame?.parentElement?.hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Back to About me' }))
    expect(container.querySelector('iframe')).toBe(frame)
    expect(frame?.parentElement?.hidden).toBe(false)
  } finally { vi.unstubAllGlobals() }
})
