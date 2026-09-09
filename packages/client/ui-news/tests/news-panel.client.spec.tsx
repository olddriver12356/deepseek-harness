// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { NewsPanel, type NewsCapture } from '../src/client/NewsPanel.tsx'
import type { NewsSnapshot } from '@deepseek-ai/dsh-host-news/types'

afterEach(cleanup)

const SNAPSHOT: NewsSnapshot = {
  fetchedAt: '2026-09-04T10:00:00.000Z',
  news: [{ title: 'Fresh story', url: 'https://example.com/story', source: 'Test', publishedAt: '2026-09-04T09:00:00.000Z', summary: 'Summary', imageUrl: null }],
  tools: [],
}

function renderNews(read = vi.fn(async () => SNAPSHOT), saveToKnowledge?: NewsCapture) {
  const appPanels = new AppPanelsController()
  const view = render(<NewsPanel appPanels={appPanels} read={read} saveToKnowledge={saveToKnowledge} />)
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

  it('captures one article into Knowledge and reports success on its own card', async () => {
    const saveToKnowledge = vi.fn(async () => {})
    const { appPanels } = renderNews(undefined, saveToKnowledge)
    act(() => { appPanels.setActive('news') })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: '收入 Knowledge' }))
    await act(async () => {})

    expect(saveToKnowledge).toHaveBeenCalledWith({
      sourceUrl: 'https://example.com/story',
      publisher: 'Test',
      retrievedAt: '2026-09-04T10:00:00.000Z',
      title: 'Fresh story',
      content: 'Title: Fresh story\nSource: Test\nPublished: 2026-09-04T09:00:00.000Z\nURL: https://example.com/story\n\nSummary',
    })
    expect(screen.getByRole('button', { name: '已收入' })).toBeTruthy()
  })

  it('reports a failed capture without disabling the card', async () => {
    const saveToKnowledge = vi.fn().mockRejectedValue(new Error('bridge down'))
    const { appPanels } = renderNews(undefined, saveToKnowledge)
    act(() => { appPanels.setActive('news') })
    await act(async () => {})

    fireEvent.click(screen.getByRole('button', { name: '收入 Knowledge' }))
    await act(async () => {})

    expect(screen.getByRole('button', { name: '收入失败，重试' })).toBeTruthy()
  })

  it('omits the capture button when no Knowledge capability is composed', async () => {
    const { appPanels } = renderNews()
    act(() => { appPanels.setActive('news') })
    await act(async () => {})

    expect(screen.queryByRole('button', { name: '收入 Knowledge' })).toBeNull()
  })
})
