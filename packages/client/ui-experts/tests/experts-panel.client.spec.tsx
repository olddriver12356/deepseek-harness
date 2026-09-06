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

  it('opens the create-expert form from the giant add button', () => {
    renderExperts()
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('heading', { name: '新增专家' })).toBeTruthy()
    expect(within(dialog).getByLabelText('名称')).toBeTruthy()
    expect(within(dialog).getByLabelText('分类')).toBeTruthy()
    expect(within(dialog).getByLabelText('一句话说明')).toBeTruthy()
    expect(within(dialog).getByLabelText('模型')).toBeTruthy()
    expect(within(dialog).getByLabelText('推理强度')).toBeTruthy()
    expect(within(dialog).getByLabelText('权限预设')).toBeTruthy()
    expect(within(dialog).getByLabelText('系统指令')).toBeTruthy()
    expect(within(dialog).getByLabelText('附加技能（用逗号分隔）')).toBeTruthy()
  })

  it('rejects an empty create-expert submit with a required-field message', () => {
    renderExperts()
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    fireEvent.click(screen.getByRole('button', { name: '创建专家' }))
    expect(screen.getByRole('alert').textContent).toBe('名称、分类、一句话说明和系统指令都是必填项。')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reports the honest not-wired state on a filled create-expert submit', () => {
    renderExperts()
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '迁移架构师' } })
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'Architecture' } })
    fireEvent.change(screen.getByLabelText('一句话说明'), { target: { value: '守护迁移契约' } })
    fireEvent.change(screen.getByLabelText('系统指令'), { target: { value: '优先使用原生钩子服务。' } })
    fireEvent.change(screen.getByLabelText('附加技能（用逗号分隔）'), { target: { value: 'brainstorming, frontend-design' } })
    fireEvent.click(screen.getByRole('button', { name: '创建专家' }))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('创建功能还没有接入数据服务，这个专家不会被保存。')
    expect(screen.getByText('brainstorming')).toBeTruthy()
    expect(screen.getByText('frontend-design')).toBeTruthy()
    // the honest failure must not silently add a fake record to the roster
    expect(screen.queryByRole('heading', { name: '迁移架构师' })).toBeNull()
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
