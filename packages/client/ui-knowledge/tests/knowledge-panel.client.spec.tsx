// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { KNOWLEDGE_FIXTURE } from '../src/client/fixture.ts'
import { KnowledgePanel } from '../src/client/KnowledgePanel.tsx'

afterEach(cleanup)

function renderKnowledge() {
  const appPanels = new AppPanelsController()
  appPanels.setActive('knowledge')
  const view = render(<KnowledgePanel appPanels={appPanels} snapshot={KNOWLEDGE_FIXTURE} />)
  return { ...view, appPanels }
}

describe('KnowledgePanel', () => {
  it('renders the approved read-only Knowledge structure from derived fixture counts', () => {
    renderKnowledge()

    expect(screen.getByRole('region', { name: 'Knowledge / 第二大脑' })).toBeTruthy()
    expect(screen.getByText('第二大脑')).toBeTruthy()
    expect(screen.getByText('READ ONLY · LOCAL AGENT LAYERS')).toBeTruthy()
    const metrics = screen.getByLabelText('Knowledge metrics')
    expect(within(metrics).getByText('05')).toBeTruthy()
    expect(within(metrics).getByText('06')).toBeTruthy()
    expect(within(metrics).getByText('02')).toBeTruthy()
    const deferredAction = screen.getByRole<HTMLButtonElement>('button', { name: '打开 ARTIFACT →' })
    expect(deferredAction.disabled).toBe(true)
    expect(deferredAction.getAttribute('aria-disabled')).toBe('true')
  })

  it('renders six Layer filters, three Layer summaries, and all five artifacts without cluster copy', () => {
    renderKnowledge()

    const filters = screen.getByRole('group', { name: 'Layers' })
    for (const name of ['1 Intake', '2 AI Processing', '3 Knowledge', '4 Personal', '5 Methods', '6 Feedback']) {
      expect(within(filters).getByRole('button', { name })).toBeTruthy()
    }
    const summaries = screen.getByRole('complementary', { name: '层级状态' })
    expect(within(summaries).getByRole('button', { name: /INTAKE LAYER/ })).toBeTruthy()
    expect(within(summaries).getByRole('button', { name: /KNOWLEDGE LAYER/ })).toBeTruthy()
    expect(within(summaries).getByRole('button', { name: /METHODS LAYER/ })).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Agent artifacts' })).getAllByRole('button')).toHaveLength(5)
    expect(screen.queryByText(/CLUSTER/i)).toBeNull()
  })

  it('keeps top Layer filter labels at the approved 13px size', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/client/ui-knowledge/src/client/KnowledgePanel.module.css'), 'utf8')
    expect(source).toMatch(/\.filters\s+button\s*\{[^}]*font-size:\s*13px;/s)
  })

  it('keeps the collage, rounded responsive grids, and complete 680ms hover sequence', () => {
    const source = readFileSync(resolve(process.cwd(), 'packages/client/ui-knowledge/src/client/KnowledgePanel.module.css'), 'utf8')
    expect(source).toContain("url('./assets/punk-collage-dark.png')")
    expect(source).toMatch(/\.artifact\s*\{[^}]*border-radius:\s*20px;/s)
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));')
    expect(source).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(source).toMatch(/\.artifactGrid\s*\{\s*grid-template-columns:\s*1fr;/s)
    expect(source).toContain('animation: dshBoujoyCardHover 680ms cubic-bezier(0.2, 0.78, 0.2, 1) both;')
    expect(source).toMatch(/38%\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*transform:/s)
    expect(source).toMatch(/72%\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*transform:/s)
    expect(source).toMatch(/100%\s*\{[^}]*border-color:[^}]*box-shadow:[^}]*transform:/s)
    expect(source).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i)
  })

  it('removes hover motion but retains accent feedback for reduced motion', () => {
    const cssPath = 'packages/client/ui-knowledge/src/client/KnowledgePanel.module.css'
    const source = readFileSync(resolve(process.cwd(), cssPath), 'utf8')
    const reducedMotionBlock = /@media \(prefers-reduced-motion: reduce\)[\s\S]*\}/.exec(source)?.[0] ?? ''
    expect(reducedMotionBlock).toMatch(/border-color:\s*var\(--hover-first\)/)
    expect(reducedMotionBlock).toMatch(/animation:\s*none/)
    expect(reducedMotionBlock).toMatch(/transform:\s*none/)
  })

  it.each(['powershell', 'POWERSHELL'])('searches case-insensitively for %s', (query) => {
    renderKnowledge()

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } })

    expect(screen.getByText('01 RESULTS')).toBeTruthy()
    const library = screen.getByRole('region', { name: 'Agent artifacts' })
    expect(within(library).getAllByRole('button')).toHaveLength(1)
    expect(within(library).getByRole('button', { name: /PowerShell ConvertTo-Json Contract/ })).toBeTruthy()
  })

  it('uses the top Methods filter for the empty library and focus states', () => {
    renderKnowledge()

    const methods = screen.getByRole('button', { name: '5 Methods' })
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
