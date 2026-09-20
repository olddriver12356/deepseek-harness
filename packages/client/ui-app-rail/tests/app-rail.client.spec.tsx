// @vitest-environment jsdom
// @vitest-environment jsdom
/**
 * App rail spec: six entries in the legacy client's order, the active one marked, and a
 * click routing through ctx.appPanels rather than through local state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { AppRail, newsLast } from '@deepseek-ai/dsh-client-ui-app-rail/src/client/AppRail.tsx'
import { ProofPanel } from '@deepseek-ai/dsh-client-ui-app-rail/src/client/ProofPanel.tsx'

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

describe('AppRail', () => {
  it('moves the active number entrance on navigation without animating the tab button', () => {
    enableMotion()
    const appPanels = new AppPanelsController()
    const view = render(<AppRail appPanels={appPanels} />)
    expect(animate).toHaveBeenCalledTimes(1)
    const first = animate.mock.calls[0]![0] as HTMLElement
    expect(first.tagName).toBe('SPAN')
    expect(first.closest('[role="tab"]')).toBe(screen.getByRole('tab', { selected: true }))
    view.rerender(<AppRail appPanels={appPanels} />)
    expect(animate).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('tab', { name: /新闻/ }))
    expect(animate).toHaveBeenCalledTimes(2)
    expect((animate.mock.calls[1]![0] as HTMLElement).closest('[role="tab"]')).toBe(screen.getByRole('tab', { selected: true }))
  })
  it('renders apps before news with their two-digit numbers', () => {
    render(<AppRail appPanels={new AppPanelsController()} />)
    const labels = screen.getAllByRole('tab').map(node => node.getAttribute('data-panel'))
    expect(labels).toEqual(['agent', 'knowledge', 'skills', 'experts', 'styles', 'monitor', 'apps', 'personal', 'news'])
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('06')).toBeTruthy()
  })

  it('marks the active entry', () => {
    const appPanels = new AppPanelsController()
    render(<AppRail appPanels={appPanels} />)
    expect(screen.getByRole('tab', { selected: true }).getAttribute('data-panel')).toBe('agent')
  })

  it('routes a click through the service and re-renders', () => {
    const appPanels = new AppPanelsController()
    render(<AppRail appPanels={appPanels} />)
    fireEvent.click(screen.getByRole('tab', { name: /新闻/ }))
    expect(appPanels.getSnapshot()).toBe('news')
    expect(screen.getByRole('tab', { selected: true }).getAttribute('data-panel')).toBe('news')
  })
  it('keeps news last when a future page is appended', () => {
    expect(newsLast([{ id: 'apps' }, { id: 'news' }, { id: 'future' }]).map(x => x.id)).toEqual(['apps', 'future', 'news'])
  })
})

describe('ProofPanel', () => {
  it.each(['agent', 'knowledge', 'monitor'] as const)('yields to the real %s panel', (id) => {
    const appPanels = new AppPanelsController()
    appPanels.setActive(id)

    const view = render(<ProofPanel appPanels={appPanels} />)

    expect(view.container.querySelector('[data-proof-panel]')).toBeNull()
  })

  it('remains visible for an unfinished panel', () => {
    const appPanels = new AppPanelsController()
    appPanels.setActive('experts')

    render(<ProofPanel appPanels={appPanels} />)

    expect(screen.getByText(/专家/)).toBeTruthy()
  })
})
