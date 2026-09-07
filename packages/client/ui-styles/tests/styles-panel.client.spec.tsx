// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import type { StyleDraft, StyleRecord } from '@deepseek-ai/dsh-host-styles/types'
import { StylesPanel, type StyleApi } from '../src/client/StylesPanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) { this.open = true },
  })
})

const t = (key: keyof typeof zh, params?: Record<string, unknown>): string =>
  zh[key].replace(/\{(\w+)\}/gu, (match, name: string) => name in (params ?? {}) ? String(params?.[name]) : match)

const APPROVED: StyleRecord = {
  id: 'style-approved', name: '简洁清晰', description: '简洁、清晰、直接。', instructions: '短句优先，先给结论。', status: 'approved', updatedAt: '2026-09-06',
}
const DRAFT: StyleRecord = {
  id: 'style-draft', name: '深度分析', description: '保留证据和不确定性。', instructions: '展开推理链条。', status: 'draft', updatedAt: '2026-09-06',
}

function renderStyles(initial: readonly StyleRecord[] = [APPROVED, DRAFT]) {
  let records = [...initial]
  const dispatch = vi.fn<StyleApi['dispatch']>().mockResolvedValue(undefined)
  const create = vi.fn(async (draft: StyleDraft): Promise<StyleRecord> => {
    const record: StyleRecord = { ...draft, id: 'style-created', updatedAt: '2026-09-06' }
    records = [...records, record]
    return record
  })
  const api: StyleApi = {
    list: vi.fn(async () => records),
    create,
    update: vi.fn(async (id: string, draft: StyleDraft): Promise<StyleRecord> => {
      const record: StyleRecord = { ...draft, id, updatedAt: '2026-09-06' }
      records = records.map(item => item.id === id ? record : item)
      return record
    }),
    remove: vi.fn(async (id: string) => { records = records.filter(item => item.id !== id) }),
    dispatch,
  }
  const appPanels = new AppPanelsController()
  appPanels.setActive('styles')
  const view = render(<StylesPanel api={api} appPanels={appPanels} t={t} />)
  return { ...view, api, appPanels, create, dispatch }
}

describe('StylesPanel', () => {
  it('loads the Vault roster and disables draft dispatch', async () => {
    renderStyles()
    expect(await screen.findByText('2 种风格')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Styles / 输出声线' })).toBeTruthy()
    const calls = screen.getAllByRole('button', { name: '使用风格 →' })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.hasAttribute('disabled')).toBe(false)
    expect(calls[1]?.hasAttribute('disabled')).toBe(true)
  })

  it('filters loaded records and preserves search across panel changes', async () => {
    const { appPanels, container } = renderStyles()
    await screen.findByText('2 种风格')
    fireEvent.change(screen.getByRole('textbox', { name: '搜索风格' }), { target: { value: '深度' } })
    expect(screen.getByText('1 种风格')).toBeTruthy()
    act(() => { appPanels.setActive('knowledge') })
    expect(container.querySelector<HTMLElement>('[data-styles-panel]')?.hidden).toBe(true)
    act(() => { appPanels.setActive('styles') })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '搜索风格' }).value).toBe('深度')
  })

  it('creates a draft through the Vault API and reloads the roster', async () => {
    const { create } = renderStyles([])
    await screen.findByText('0 种风格')
    fireEvent.click(screen.getByRole('button', { name: /新增风格/ }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '正式书面' } })
    fireEvent.change(screen.getByLabelText('一句话说明'), { target: { value: '严谨、正式、无口语。' } })
    fireEvent.change(screen.getByLabelText('输出声线指令'), { target: { value: '避免缩写和口语表达。' } })
    fireEvent.click(screen.getByRole('button', { name: '保存到 Vault' }))
    await waitFor(() => { expect(create).toHaveBeenCalledOnce() })
    expect(await screen.findByRole('heading', { name: '正式书面' })).toBeTruthy()
  })

  it('opens the Style editor in the browser modal layer', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    try {
      renderStyles([])
      await screen.findByText('0 种风格')
      fireEvent.click(screen.getByRole('button', { name: /新增风格/ }))
      await waitFor(() => { expect(showModal).toHaveBeenCalledOnce() })
    } finally {
      showModal.mockRestore()
    }
  })

  it('dispatches an approved Style task to the current Session API', async () => {
    const { dispatch } = renderStyles([APPROVED])
    await screen.findByText('1 种风格')
    fireEvent.click(screen.getByRole('button', { name: '使用风格 →' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('本次任务'), { target: { value: '重写这段说明' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '送进 Agent →' }))
    await waitFor(() => { expect(dispatch).toHaveBeenCalledWith(APPROVED, '重写这段说明') })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
