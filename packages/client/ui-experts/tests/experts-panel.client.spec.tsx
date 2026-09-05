// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { ExpertsPanel } from '../src/client/ExpertsPanel.tsx'

afterEach(cleanup)

function renderExperts() {
  const appPanels = new AppPanelsController()
  appPanels.setActive('experts')
  const view = render(<ExpertsPanel appPanels={appPanels} />)
  return { ...view, appPanels }
}

describe('ExpertsPanel', () => {
  it('renders the approved Boujoy roster layout and records', () => {
    renderExperts()

    expect(screen.getByRole('region', { name: 'Experts / 专家调用阵容' })).toBeTruthy()
    expect(screen.getByText('CALL THE RIGHT BRAIN')).toBeTruthy()
    expect(screen.getByText('专家不是头像，')).toBeTruthy()
    expect(screen.getByRole('button', { name: /新增专家/ })).toBeTruthy()
    expect(screen.getByText('4 位专家')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /调用专家/ })).toHaveLength(4)
  })

  it('filters records case-insensitively and keeps the approved empty copy', () => {
    renderExperts()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: '代码' } })
    expect(screen.getByText('1 位专家')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '代码审查专家' })).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: '没有这个专家' } })
    expect(screen.getByText('0 位专家')).toBeTruthy()
    expect(screen.getByText('专家阵容还是空的')).toBeTruthy()
  })

  it('opens the approved record and dispatch dialogs', () => {
    renderExperts()
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '新增专家' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: '调用专家 →' })[0]!)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '调用专家' })).toBeTruthy()
    expect(within(dialog).getByText('产品战略专家')).toBeTruthy()
  })

  it('stays mounted and preserves search when another app panel becomes active', () => {
    const { appPanels, container } = renderExperts()
    const panel = container.querySelector<HTMLElement>('[data-experts-panel]')!
    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: '研究' } })
    act(() => { appPanels.setActive('knowledge') })
    expect(panel.hidden).toBe(true)
    expect(container.querySelector('[data-experts-panel]')).toBe(panel)
    act(() => { appPanels.setActive('experts') })
    expect(panel.hidden).toBe(false)
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '搜索专家' }).value).toBe('研究')
  })
})
