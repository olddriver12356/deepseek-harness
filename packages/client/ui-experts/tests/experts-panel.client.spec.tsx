// @vitest-environment jsdom
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import type { ExpertDraft, ExpertRecord } from '@deepseek-ai/dsh-host-experts/types'
import type { StyleRecord } from '@deepseek-ai/dsh-host-styles/types'
import { ExpertsPanel, type ExpertApi } from '../src/client/ExpertsPanel.tsx'
import { zh } from '../src/client/locales.ts'

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
  // The execution filter persists to localStorage; a leaked value would silently
  // narrow the roster in every later test.
  localStorage.clear()
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function enableMotion() {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON() {} })
}
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
  instructions: '先复现，再给证据。', status: 'approved', execution: 'conversational', model: 'inherit', reasoning: 'high', updatedAt: '2026-09-06',
}
const DRAFT: ExpertRecord = {
  id: 'agent-draft', name: '研究专家', category: 'Research', description: '寻找证据。', instructions: '区分事实和推断。',
  status: 'draft', execution: 'conversational', model: 'inherit', reasoning: 'inherit', updatedAt: '2026-09-06',
}
const DELEGATED: ExpertRecord = {
  id: 'agent-delegated', name: '根因判定专家', category: 'Engineering', description: '把失败追到根因。',
  instructions: '先复现，再改代码。', status: 'approved', execution: 'delegated', model: 'inherit', reasoning: 'inherit', updatedAt: '2026-09-06',
}
const CONCISE_STYLE: StyleRecord = {
  id: 'style-concise', name: '简洁清晰', description: '简洁、清晰、直接。', instructions: '短句优先，先给结论。', status: 'approved', updatedAt: '2026-09-06',
}

function renderExperts(initial: readonly ExpertRecord[] = [APPROVED, DRAFT], styles: readonly StyleRecord[] = [CONCISE_STYLE]) {
  let records = [...initial]
  const saved: ExpertDraft[] = []
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
      saved.push(draft)
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
  return { ...view, api, appPanels, create, dispatch, saved }
}

describe('ExpertsPanel', () => {
  it('keeps filtering still and opens motion after showModal, including reopening after native cancel', async () => {
    enableMotion()
    renderExperts()
    await screen.findByText('2 位专家')
    expect(animate).toHaveBeenCalledTimes(2)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: '研究' } })
    expect(animate).toHaveBeenCalledTimes(2)
    const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    const dialog = screen.getByRole<HTMLDialogElement>('dialog')
    expect(dialog.open).toBe(true)
    expect(showModal.mock.invocationCallOrder[0]).toBeLessThan(animate.mock.invocationCallOrder[2]!)
    expect(animate).toHaveBeenCalledTimes(3)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'New draft' } })
    expect(animate).toHaveBeenCalledTimes(3)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog.isConnected).toBe(true)
    fireEvent(dialog, new Event('close'))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /新增专家/ }))
    expect(screen.getByRole<HTMLDialogElement>('dialog').open).toBe(true)
    expect(animate).toHaveBeenCalledTimes(4)
  })
  it('loads the Vault roster and disables draft dispatch', async () => {
    renderExperts()
    expect(await screen.findByText('2 位专家')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Experts / 专家调用阵容' })).toBeTruthy()
    const calls = screen.getAllByRole('button', { name: '调用专家 →' })
    expect(calls).toHaveLength(2)
    expect(calls[0]?.hasAttribute('disabled')).toBe(false)
    expect(calls[1]?.hasAttribute('disabled')).toBe(true)
  })

  it('marks a delegated Expert on its card and leaves conversational cards unmarked', async () => {
    renderExperts([APPROVED, DELEGATED])
    await screen.findByText('2 位专家')
    expect(screen.getAllByText('委派')).toHaveLength(1)
  })

  it('offers no Call button for a delegated Expert but keeps its management actions', async () => {
    renderExperts([DELEGATED])
    await screen.findByText('1 位专家')
    // The main Agent calls a delegated Expert as a tool inside a turn; the panel
    // must not offer a turn-external dispatch path for it.
    expect(screen.queryByRole('button', { name: '调用专家 →' })).toBeNull()
    for (const action of ['编辑', '复制', '删除']) {
      expect(screen.getByRole('button', { name: action })).toBeTruthy()
    }
  })

  it('keeps the Call button for an approved conversational Expert', async () => {
    renderExperts([APPROVED, DELEGATED])
    await screen.findByText('2 位专家')
    const calls = screen.getAllByRole('button', { name: '调用专家 →' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.hasAttribute('disabled')).toBe(false)
  })

  it('keeps the Session-inheritance notice for a conversational Expert', async () => {
    renderExperts([APPROVED])
    await screen.findByText('1 位专家')
    fireEvent.click(screen.getByRole('button', { name: '调用专家 →' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(zh.dispatchNotice)).toBeTruthy()
    expect(within(dialog).queryByText(zh.dispatchNoticeDelegated)).toBeNull()
  })

  it('round-trips the execution mode through the edit form', async () => {
    const { saved } = renderExperts([APPROVED])
    await screen.findByText('1 位专家')
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('执行方式'), { target: { value: 'delegated' } })
    fireEvent.click(screen.getByRole('button', { name: '保存到 Vault' }))
    await waitFor(() => { expect(saved).toHaveLength(1) })
    expect(saved[0]?.execution).toBe('delegated')
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

  it('filters the roster by execution mode and reports the filtered count', async () => {
    renderExperts([APPROVED, DELEGATED])
    await screen.findByText('2 位专家')
    const filter = screen.getByRole('combobox', { name: '按执行方式筛选' })
    fireEvent.change(filter, { target: { value: 'delegated' } })
    expect(screen.getByText('1 位专家')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '根因判定专家' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '代码审查专家' })).toBeNull()
    fireEvent.change(filter, { target: { value: 'conversational' } })
    expect(screen.getByRole('heading', { name: '代码审查专家' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '根因判定专家' })).toBeNull()
    fireEvent.change(filter, { target: { value: 'all' } })
    expect(screen.getByText('2 位专家')).toBeTruthy()
  })

  it('combines the execution filter with the search query', async () => {
    renderExperts([APPROVED, DELEGATED])
    await screen.findByText('2 位专家')
    fireEvent.change(screen.getByRole('combobox', { name: '按执行方式筛选' }), { target: { value: 'delegated' } })
    fireEvent.change(screen.getByRole('textbox', { name: '搜索专家' }), { target: { value: '代码审查' } })
    expect(screen.getByText('0 位专家')).toBeTruthy()
  })

  it('persists the execution filter and restores it on the next mount', async () => {
    const first = renderExperts([APPROVED, DELEGATED])
    await screen.findByText('2 位专家')
    fireEvent.change(screen.getByRole('combobox', { name: '按执行方式筛选' }), { target: { value: 'delegated' } })
    expect(localStorage.getItem('dsh.experts.executionFilter')).toBe('delegated')
    first.unmount()
    renderExperts([APPROVED, DELEGATED])
    await screen.findByText('1 位专家')
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '按执行方式筛选' }).value).toBe('delegated')
  })

  it('ignores a corrupt persisted filter instead of hiding the roster', async () => {
    localStorage.setItem('dsh.experts.executionFilter', 'not-a-mode')
    renderExperts([APPROVED, DELEGATED])
    await screen.findByText('2 位专家')
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '按执行方式筛选' }).value).toBe('all')
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
