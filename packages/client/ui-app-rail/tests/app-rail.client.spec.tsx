// @vitest-environment jsdom
/**
 * App rail spec: six entries in the legacy client's order, the active one marked, and a
 * click routing through ctx.appPanels rather than through local state.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { AppRail } from '@deepseek-ai/dsh-client-ui-app-rail/src/client/AppRail.tsx'
import { ProofPanel } from '@deepseek-ai/dsh-client-ui-app-rail/src/client/ProofPanel.tsx'

afterEach(cleanup)

describe('AppRail', () => {
  it('renders six entries in order with their two-digit numbers', () => {
    render(<AppRail appPanels={new AppPanelsController()} />)
    const labels = screen.getAllByRole('tab').map(node => node.getAttribute('data-panel'))
    expect(labels).toEqual(['agent', 'knowledge', 'experts', 'styles', 'monitor', 'news'])
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
