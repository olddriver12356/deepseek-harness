// @vitest-environment jsdom
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { NewsPanel, type NewsCapture } from '../src/client/NewsPanel.tsx'
import { apply } from '../src/client/index.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { NewsSnapshot } from '@deepseek-ai/dsh-host-news/types'
import { readFileSync } from 'node:fs'

beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
  it('preserves compact news typography and wrapping actions', () => {
    const css = readFileSync('packages/client/ui-news/src/client/NewsPanel.module.css', 'utf8')
    expect(css).toMatch(/\.summary\s*\{[^}]*font-size:\s*11px/)
    expect(css).toMatch(/\.actions\s*\{[^}]*flex-wrap:\s*wrap/)
    expect(css).toMatch(/\.actions\s*\{[^}]*justify-content:\s*flex-start/)
    expect(css).toMatch(/\.sourceLink\s*\{[^}]*align-self:\s*flex-end/)
    const rail = readFileSync('packages/client/ui-app-rail/src/client/AppRail.module.css', 'utf8')
    expect(rail).toMatch(/\.entry small\s*\{[^}]*font:\s*700 8px/)
  })
  it('wires capture before isolated distillation and never invokes review or publication', async () => {
    const saveText = vi.fn(async () => ({ ok: true, value: { id: 'intake-id' } }))
    const distill = vi.fn(async () => ({ ok: true, value: { id: 'processed-id' } }))
    let injected: { distillNews: NewsCapture } | undefined
    const ctx = {
      effect: (effect: () => unknown) => effect(),
      locale: { register: () => () => {}, bind: () => (key: string) => key },
      appPanels: new AppPanelsController(),
      remote: { get knowledge(): never { throw new Error('remote.knowledge requires optional service lookup') } },
      get: () => ({ saveText, distill }),
      slots: { inject: (_slot: string, callback: () => void) => { callback() },
        register: (options: { inject: () => typeof injected }) => { injected = options.inject() } },
    }
    apply(ctx as unknown as Context)
    const request = { sourceUrl: 'https://example.com/story', publisher: 'Test',
      retrievedAt: SNAPSHOT.fetchedAt!, title: 'Fresh story', content: 'Summary' }
    await injected!.distillNews(request)
    expect(saveText).toHaveBeenCalledWith(request)
    expect(distill).toHaveBeenCalledWith({ id: 'intake-id' })
    expect(saveText.mock.invocationCallOrder[0]).toBeLessThan(distill.mock.invocationCallOrder[0]!)
    saveText.mockRejectedValueOnce(new Error('capture failed'))
    await expect(injected!.distillNews(request)).rejects.toThrow('capture failed')
    expect(distill).toHaveBeenCalledTimes(1)
  })

  it('distills only the selected news card on an explicit click', async () => {
    const appPanels = new AppPanelsController()
    const distillNews = vi.fn(async () => {})
    render(<NewsPanel appPanels={appPanels} read={async () => SNAPSHOT} distillNews={distillNews} />)
    act(() => { appPanels.setActive('news') })
    await act(async () => {})
    expect(distillNews).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '蒸馏此条' }))
    await act(async () => {})
    expect(distillNews).toHaveBeenCalledWith(expect.objectContaining({ sourceUrl: 'https://example.com/story' }))
    expect(screen.getByRole('button', { name: '已蒸馏' })).toBeTruthy()
  })
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
