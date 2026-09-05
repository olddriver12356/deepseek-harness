// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { NewsPanel } from '../src/client/NewsPanel.tsx'
import type { NewsSnapshot } from '@deepseek-ai/dsh-host-news/types'

afterEach(cleanup)

const SNAPSHOT: NewsSnapshot = {
  fetchedAt: '2026-09-04T10:00:00.000Z',
  news: [{ title: 'Fresh story', url: 'https://example.com/story', source: 'Test', publishedAt: '2026-09-04T09:00:00.000Z', summary: 'Summary', imageUrl: null }],
  tools: [],
}

function renderNews(read = vi.fn(async () => SNAPSHOT)) {
  const appPanels = new AppPanelsController()
  const view = render(<NewsPanel appPanels={appPanels} read={read} />)
  return { ...view, appPanels, read }
}

describe('NewsPanel', () => {
  it('loads only when the News app panel becomes active and renders both columns', async () => {
    const { appPanels, read } = renderNews()
    expect(read).not.toHaveBeenCalled()

    act(() => { appPanels.setActive('news') })
    await act(async () => {})

    expect(read).toHaveBeenCalledWith({ refresh: false })
    expect(screen.getByRole('main', { name: '' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Fresh story' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '工具与模型动态' })).toBeTruthy()
  })

  it('refreshes on demand and exposes remote failures', async () => {
    const read = vi.fn().mockResolvedValueOnce(SNAPSHOT).mockRejectedValueOnce(new Error('offline'))
    const { appPanels } = renderNews(read)
    act(() => { appPanels.setActive('news') })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: '↻ 刷新抓取' }))
    await act(async () => {})
    expect(read).toHaveBeenNthCalledWith(2, { refresh: true })
    expect(screen.getByRole('alert').textContent).toBe('新闻源暂时不可用，请稍后重试。')
  })
})
