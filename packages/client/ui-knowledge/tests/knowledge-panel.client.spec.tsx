// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { KNOWLEDGE_FIXTURE } from '../src/client/fixture.ts'
import { KnowledgePanel } from '../src/client/KnowledgePanel.tsx'

const { animationPath, animate } = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const require = createRequire(path.resolve('packages/client/ui-primitives/package.json'))
  const manifest = require('animejs/package.json') as { module: string }
  return { animationPath: path.resolve(path.dirname(require.resolve('animejs/package.json')), manifest.module), animate: vi.fn((_targets: unknown, _options: unknown) => ({ revert: vi.fn() })) }
})
vi.mock(animationPath, () => ({ animate, stagger: (delay: number) => (_target: unknown, index: number) => delay * index }))
beforeEach(() => {
  animate.mockClear()
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function enableMotion() {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} })
}

function renderKnowledge() {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const view = render(<KnowledgePanel appPanels={appPanels} snapshot={KNOWLEDGE_FIXTURE} />)
  return { ...view, appPanels }
}

describe('KnowledgePanel', () => {
  it('replays cards for a layer choice but keeps search and snapshot refresh still', () => {
    enableMotion()
    const { appPanels, rerender } = renderKnowledge()
    expect(animate).toHaveBeenCalledTimes(2)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'powershell' } })
    expect(screen.getByText('01 RESULTS')).toBeTruthy()
    rerender(<KnowledgePanel appPanels={appPanels} snapshot={{ ...KNOWLEDGE_FIXTURE }} />)
    expect(animate).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: '3 Knowledge' }))
    expect(screen.getByRole('button', { name: '3 Knowledge' }).getAttribute('aria-pressed')).toBe('true')
    expect(animate).toHaveBeenCalledTimes(3)
    act(() => { appPanels.setActive('news') })
    act(() => { appPanels.setActive('knowledge') })
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('powershell')
    expect(animate).toHaveBeenCalledTimes(5)
  })
  it('renders the original hero as the page heading', () => {
    renderKnowledge()
    expect(screen.getByRole('heading', { level: 1, name: '你的第二大脑，正在形成。' })).toBeTruthy()
  })
  it('renders the owner-approval Knowledge structure from derived fixture counts', () => {
    renderKnowledge()

    expect(screen.getByRole('region', { name: '知识库 / 第二大脑' })).toBeTruthy()
    expect(screen.getByText('第二大脑')).toBeTruthy()
    expect(screen.getByText('用户审批 · LOCAL AGENT LAYERS')).toBeTruthy()
    const metrics = screen.getByLabelText('Knowledge metrics')
    expect(within(metrics).getByText('05')).toBeTruthy()
    expect(within(metrics).getByText('03')).toBeTruthy()
    expect(within(metrics).getByText('02')).toBeTruthy()
    const deferredAction = screen.getByRole<HTMLButtonElement>('button', { name: '打开 ARTIFACT →' })
    expect(deferredAction.disabled).toBe(true)
    expect(deferredAction.getAttribute('aria-disabled')).toBe('true')
  })

  it('renders three upstream Layer filters and summaries without retired layers', () => {
    renderKnowledge()

    const filters = screen.getByRole('group', { name: 'Layers' })
    for (const name of ['1 Intake', '2 Processed', '3 Knowledge']) {
      expect(within(filters).getByRole('button', { name })).toBeTruthy()
    }
    const summaries = screen.getByRole('complementary', { name: '层级状态' })
    expect(within(summaries).getByRole('button', { name: /INTAKE LAYER/ })).toBeTruthy()
    expect(within(summaries).getByRole('button', { name: /KNOWLEDGE LAYER/ })).toBeTruthy()
    expect(within(summaries).getByRole('button', { name: /PROCESSED LAYER/ })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Agent artifacts' })).getAllByRole('button')).toHaveLength(5)
    expect(screen.queryByText(/CLUSTER/i)).toBeNull()
  })

  it('keeps top Layer filter labels at the approved 14px size', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/client/ui-knowledge/src/client/KnowledgePanel.module.css'), 'utf8')
    expect(source).toMatch(/\.filters\s+button\s*\{[^}]*font-size:\s*14px;/s)
  })

  it('keeps the collage and layer animation around responsive paper cards', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/client/ui-knowledge/src/client/KnowledgePanel.module.css'), 'utf8')
    expect(source).toContain("url('./assets/field-notes.png')")
    expect(source).toMatch(/\.artifact\s*\{[^}]*border-radius:\s*0;/s)
    expect(source).toMatch(/\.artifact::before\s*\{[^}]*clip-path:\s*polygon\(/s)
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(source).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(source).toMatch(/\.artifactGrid\s*\{\s*grid-template-columns:\s*1fr;/s)
    expect(source).toContain('animation: dshBoujoyCardHover 680ms cubic-bezier(0.2, 0.78, 0.2, 1) both;')
    expect(source).toMatch(/38%\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*transform:/s)
    expect(source).toMatch(/72%\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*transform:/s)
    expect(source).toMatch(/100%\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*transform:/s)
  })

  it('removes hover motion but retains accent feedback for reduced motion', () => {
    const cssPath = 'packages/client/ui-knowledge/src/client/KnowledgePanel.module.css'
    const source = readFileSync(resolve(process.cwd(), cssPath), 'utf8')
    const reducedMotionBlock = /@media \(prefers-reduced-motion: reduce\)[\s\S]*\}/.exec(source)?.[0] ?? ''
    expect(reducedMotionBlock).toMatch(/border-color:\s*var\(--hover-first\)/)
    expect(reducedMotionBlock).toMatch(/animation:\s*none/)
    expect(reducedMotionBlock).toMatch(/transform:\s*none/)
    expect(reducedMotionBlock).toMatch(/rotate:\s*none/)
    expect(reducedMotionBlock).toMatch(/translate:\s*none/)
  })

  it.each(['powershell', 'POWERSHELL'])('searches case-insensitively for %s', (query) => {
    renderKnowledge()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } })

    expect(screen.getByText('01 RESULTS')).toBeTruthy()
    const library = screen.getByRole('region', { name: 'Agent artifacts' })
    expect(within(library).getAllByRole('button')).toHaveLength(1)
    expect(within(library).getByRole('button', { name: /PowerShell ConvertTo-Json Contract/ })).toBeTruthy()
  })

  it('filters by Kind between News and non-News captures', () => {
    const newsArtifact = {
      id: 'news-capture', layerId: 'intake', state: 'READY', title: 'AI roundup',
      summary: 'wire copy', updatedAt: '2026-09-10', topics: ['news-article'],
    } as const
    const snapshot = { ...KNOWLEDGE_FIXTURE, artifacts: [...KNOWLEDGE_FIXTURE.artifacts, newsArtifact] }
    const appPanels = new AppPanelsController()
    appPanels.setActive('knowledge')
    render(<KnowledgePanel appPanels={appPanels} snapshot={snapshot} />)

    fireEvent.click(screen.getByRole('button', { name: '新闻' }))
    expect(screen.getByText('01 RESULTS')).toBeTruthy()
    expect(screen.getByRole('button', { name: /AI roundup/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '非新闻' }))
    expect(screen.getByText('05 RESULTS')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /AI roundup/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '全部类型' }))
    expect(screen.getByText('06 RESULTS')).toBeTruthy()
  })

  it('uses the empty Processed filter for the empty library and focus states', () => {
    renderKnowledge()

    const methods = screen.getByRole('button', { name: '2 Processed' })
    fireEvent.click(methods)

    expect(methods.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('00 RESULTS')).toBeTruthy()
    expect(screen.getByText('这个 Layer 还没有 artifact。')).toBeTruthy()
    expect(screen.getByText('当前筛选没有可聚焦的 artifact。')).toBeTruthy()
  })

  it('routes the Intake summary through the same active Layer state', () => {
    renderKnowledge()

    const intakeSummary = within(screen.getByRole('complementary', { name: '层级状态' })).getByRole('button', { name: /INTAKE LAYER/ })
    fireEvent.click(intakeSummary)

    expect(intakeSummary.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: '1 Intake' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('03 RESULTS')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Agent artifacts' })).getAllByRole('button')).toHaveLength(3)
  })

  it('selects an artifact into focus and falls back when a filter hides it', () => {
    renderKnowledge()

    fireEvent.click(screen.getByRole('button', { name: /Historical JSON Retrieval Failure/ }))
    expect(screen.getByRole('heading', { name: 'Historical JSON Retrieval Failure' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '3 Knowledge' }))
    expect(screen.getByRole('heading', { name: 'PowerShell ConvertTo-Json Contract' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Historical JSON Retrieval Failure' })).toBeNull()
  })

  it('stays mounted, leaves the accessibility tree while hidden, and preserves local state', () => {
    const { appPanels, container } = renderKnowledge()
    const panel = container.querySelector<HTMLElement>('[data-knowledge-panel]')!
    const search = screen.getByRole<HTMLInputElement>('searchbox')
    fireEvent.change(search, { target: { value: 'vault' } })
    fireEvent.click(within(screen.getByRole('complementary', { name: '层级状态' })).getByRole('button', { name: /INTAKE LAYER/ }))
    fireEvent.click(screen.getByRole('button', { name: /Vault Surface Review/ }))

    act(() => { appPanels.setActive('agent') })
    expect(panel.hidden).toBe(true)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(container.querySelector('[data-knowledge-panel]')).toBe(panel)

    act(() => { appPanels.setActive('knowledge') })
    expect(panel.hidden).toBe(false)
    expect(screen.getByRole<HTMLInputElement>('searchbox').value).toBe('vault')
    expect(screen.getByRole('button', { name: '1 Intake' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Vault Surface Review' })).toBeTruthy()
  })
})
