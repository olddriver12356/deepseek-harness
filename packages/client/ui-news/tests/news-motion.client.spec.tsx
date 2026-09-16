// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import type { NewsSnapshot } from '@deepseek-ai/dsh-host-news/types'
import { NewsPanel } from '../src/client/NewsPanel.tsx'

const { animationPath, animate } = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const require = createRequire(path.resolve('packages/client/ui-primitives/package.json'))
  const manifest = require('animejs/package.json') as { module: string }
  return { animationPath: path.resolve(path.dirname(require.resolve('animejs/package.json')), manifest.module), animate: vi.fn(() => ({ revert: vi.fn() })) }
})
vi.mock(animationPath, () => ({ animate, stagger: (delay: number) => (_target: unknown, index: number) => delay * index }))

beforeEach(() => {
  vi.mocked(animate).mockClear()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const snapshot: NewsSnapshot = {
  fetchedAt: '2026-09-09T10:00:00Z',
  news: [{ title: 'First feed story', url: 'https://example.com/story', source: 'Test', publishedAt: null, summary: 'Feed summary', imageUrl: null }],
  tools: [],
}

it('reveals a late feed once per activation and does not replay on manual refresh', async () => {
  let finish!: (value: NewsSnapshot) => void
  const initial = new Promise<NewsSnapshot>((resolve) => { finish = resolve })
  const read = vi.fn().mockReturnValueOnce(initial).mockResolvedValue(snapshot)
  const appPanels = new AppPanelsController()
  render(<NewsPanel appPanels={appPanels} read={read} />)
  expect(animate).not.toHaveBeenCalled()
  act(() => { appPanels.setActive('news') })
  expect(animate).toHaveBeenCalledTimes(1)
  await act(async () => { finish(snapshot) })
  expect(screen.getByRole('heading', { name: 'First feed story' })).toBeTruthy()
  expect(animate).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: '↻ 刷新抓取' }))
  await act(async () => {})
  expect(read).toHaveBeenLastCalledWith({ refresh: true })
  expect(screen.getByRole('heading', { name: 'First feed story' })).toBeTruthy()
  expect(animate).toHaveBeenCalledTimes(2)
  act(() => { appPanels.setActive('monitor') })
  act(() => { appPanels.setActive('news') })
  expect(animate).toHaveBeenCalledTimes(4)
})

it('waits for visibility when the first request finishes behind another panel', async () => {
  let finish!: (value: NewsSnapshot) => void
  const read = () => new Promise<NewsSnapshot>((resolve) => { finish = resolve })
  const appPanels = new AppPanelsController()
  render(<NewsPanel appPanels={appPanels} read={read} />)
  act(() => { appPanels.setActive('news') })
  act(() => { appPanels.setActive('monitor') })
  await act(async () => { finish(snapshot) })
  expect(screen.queryByRole('heading', { name: 'First feed story' })).toBeNull()
  expect(animate).toHaveBeenCalledTimes(1)
  act(() => { appPanels.setActive('news') })
  expect(screen.getByRole('heading', { name: 'First feed story' })).toBeTruthy()
  expect(animate).toHaveBeenCalledTimes(3)
})
