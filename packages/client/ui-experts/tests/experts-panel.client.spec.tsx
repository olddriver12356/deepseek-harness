// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import type { ExpertDraft, ExpertRecord } from '@deepseek-ai/dsh-host-experts/types'
import type { StyleRecord } from '@deepseek-ai/dsh-host-styles/types'
import { ExpertsPanel, type ExpertApi } from '../src/client/ExpertsPanel.tsx'
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

const APPROVED: ExpertRecord = {
  id: 'agent-approved', name: '代码审查专家', category: 'Engineering', description: '沿真实调用链审查代码。',
  instructions: '先复现，再给证据。', status: 'approved', model: 'inherit', reasoning: 'high', permission: 'inherit', skills: [], updatedAt: '2026-09-06',
}
const DRAFT: ExpertRecord = {
  id: 'agent-draft', name: '研究专家', category: 'Research', description: '寻找证据。', instructions: '区分事实和推断。',
  status: 'draft', model: 'inherit', reasoning: 'inherit', permission: 'inherit', skills: [], updatedAt: '2026-09-06',
}
const CONCISE_STYLE: StyleRecord = {
  id: 'style-concise', name: '简洁清晰', description: '简洁、清晰、直接。', instructions: '短句优先，先给结论。', status: 'approved', updatedAt: '2026-09-06',
}

function renderExperts(initial: readonly ExpertRecord[] = [APPROVED, DRAFT], styles: readonly StyleRecord[] = [CONCISE_STYLE]) {
  let records = [...initial]
  const dispatch = vi.fn<ExpertApi['dispatch']>().mockResolvedValue(undefined)
  const create = vi.fn(async (draft: ExpertDraft): Promise<ExpertRecord> => {
    const record: ExpertRecord = { ...draft, id: 'agent-created', updatedAt: '2026-09-06' }
    records = [...records, record]
    return record
  })
  const api: ExpertApi = {
    list: vi.fn(async () => records),
    create,
    update: vi.fn(async (id: string, draft: ExpertDraft): Promise<ExpertRecord> => {
      const record: ExpertRecord = { ...draft, id, updatedAt: '2026-09-06' }
      records = records.map(item => item.id === id ? record : item)
      return record
    }),
    remove: vi.fn(async (id: string) => { records = records.filter(item => item.id !== id) }),
    listStyles: vi.fn(async () => styles),
    dispatch,
  }
  const appPanels = new AppPanelsController()
  appPanels.setActive('experts')
  const view = render(<ExpertsPanel api={api} appPanels={appPanels} t={t} />)
  return { ...view, api, appPanels, create, dispatch }
}

describe('ExpertsPanel', () => {
  it('loads the Vault roster and disables draft dispatch', async () => {
    renderExperts()
    expect(await screen.findByText('2 位专家')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Experts / 专家调用阵容' })).toBeTruthy()
    const calls = screen.getAllByRole('button', { name: '调用专家 →' })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.hasAttribute('disabled')).toBe(false)
    expect(calls[1]?.hasAttribute('disabled')).toBe(true)
  })

  it('filters loaded records and preserves search across panel changes', async () => {
    const { appPanels, container } = renderExperts()
    await screen.findByText('2 位专家')
    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: '研究' } })
    expect(screen.getByText('1 位专家')).toBeTruthy()
    act(() => { appPanels.setActive('knowledge') })
    expect(container.querySelector<HTMLElement>('[data-experts-panel]')?.hidden).toBe(true)
    act(() => { appPanels.setActive('experts') })
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: '搜索专家' }).value).toBe('研究')
  })

  it('creates a draft through the Vault API and reloads the roster', async () => {
    const { create } = renderExperts([])
    await screen.findByText('0 位专家')
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '迁移架构师' } })
    fireEvent.change(screen.getByLabelText('分类'), { target: { value: 'Architecture' } })
    fireEvent.change(screen.getByLabelText('一句话说明'), { target: { value: '守护迁移契约' } })
    fireEvent.change(screen.getByLabelText('系统指令'), { target: { value: '优先使用原生服务。' } })
    fireEvent.click(screen.getByRole('button', { name: '保存到 Vault' }))
    await waitFor(() => { expect(create).toHaveBeenCalledOnce() })
    expect(await screen.findByRole('heading', { name: '迁移架构师' })).toBeTruthy()
  })

  it('opens the Expert editor in the browser modal layer', async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    try {
      renderExperts([])
      await screen.findByText('0 位专家')
      fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
      await waitFor(() => { expect(showModal).toHaveBeenCalledOnce() })
    } finally {
      showModal.mockRestore()
    }
  })

  it('dispatches an approved Expert task to the current Session API', async () => {
    const { dispatch } = renderExperts([APPROVED])
    await screen.findByText('1 位专家')
    fireEvent.click(screen.getByRole('button', { name: '调用专家 →' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('本次任务'), { target: { value: '审查这个变更' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '送进 Agent →' }))
    await waitFor(() => { expect(dispatch).toHaveBeenCalledWith(APPROVED, '审查这个变更', undefined) })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lists approved Styles in the dispatch dialog and forwards the selected record', async () => {
    const { dispatch } = renderExperts([APPROVED])
    await screen.findByText('1 位专家')
    fireEvent.click(screen.getByRole('button', { name: '调用专家 →' }))
    const dialog = screen.getByRole('dialog')
    await waitFor(() => { expect(within(dialog).getByText('简洁清晰')).toBeTruthy() })
    fireEvent.change(within(dialog).getByLabelText('叠加输出风格'), { target: { value: CONCISE_STYLE.id } })
    fireEvent.change(within(dialog).getByLabelText('本次任务'), { target: { value: '审查这个变更' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '送进 Agent →' }))
    await waitFor(() => { expect(dispatch).toHaveBeenCalledWith(APPROVED, '审查这个变更', CONCISE_STYLE) })
  })
})
