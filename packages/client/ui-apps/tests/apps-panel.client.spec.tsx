// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppsPanel, type AppsApi } from '../src/client/AppsPanel.tsx'
import { zh } from '../src/client/locales.ts'
import type { AppSnapshot, ProjectInspection } from '../../../host/apps/src/types.ts'
import { AppPanelsController } from '../../ui-shell/src/client/app-panels.ts'

it('opens registration from the empty state using the workspace picker', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  const api: AppsApi = { list: vi.fn(async () => ({ apps: [] })), pick: vi.fn(async () => 'C:/app'), inspect: vi.fn(async (): Promise<ProjectInspection> => ({ directory: 'C:/app', name: 'Example', scripts: { dev: 'vite' }, packageManagers: ['npm'] })), save: vi.fn(), start: vi.fn(), stop: vi.fn(), logs: vi.fn(), remove: vi.fn(), confirmExternal: vi.fn() }
  const panels = new AppPanelsController(); panels.setActive('apps')
  const mounted = render(<AppsPanel appPanels={panels} api={api} t={key => zh[key]} />)
  fireEvent.click(screen.getByRole('button', { name: /注册应用$/ }))
  await waitFor(() => { expect(screen.getByDisplayValue('Example')).toBeTruthy() })
  expect(api.pick).toHaveBeenCalledOnce()
  expect(screen.getByDisplayValue('dev')).toBeTruthy()
  mounted.unmount()
})

it('registers a desktop executable and starts it without opening a browser tab', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  const path = 'C:\\Trusted\\Widget.exe'
  let records: AppSnapshot[] = []
  const api: AppsApi = { list: vi.fn(async () => ({ apps: records })), pick: vi.fn(), inspect: vi.fn(),
    save: vi.fn(async (registration) => { records = [{ ...registration, id: 'desktop-1', directory: 'C:\\Trusted', state: 'stopped', activeUrl: '', error: '' }] }),
    start: vi.fn(), stop: vi.fn(), logs: vi.fn(), remove: vi.fn(), confirmExternal: vi.fn() }
  const opened = vi.spyOn(window, 'open').mockImplementation(() => null)
  const panels = new AppPanelsController(); panels.setActive('apps')
  const mounted = render(<AppsPanel appPanels={panels} api={api} t={key => zh[key]} />)
  try {
    fireEvent.click(screen.getByRole('button', { name: '注册桌面应用' }))
    fireEvent.change(screen.getByPlaceholderText('输入可信程序的绝对路径'), { target: { value: path } })
    fireEvent.change(screen.getByRole('textbox', { name: '名称' }), { target: { value: 'Widget' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'desktop', executable: path })))
    await screen.findByText(path)
    fireEvent.click(screen.getByRole('button', { name: '启动并打开' }))
    await waitFor(() => expect(api.start).toHaveBeenCalledWith('desktop-1'))
    expect(opened).not.toHaveBeenCalled()
  } finally { mounted.unmount(); opened.mockRestore() }
})

it('counts managed and external apps together and filters without changing card colors', async () => {
  const records: AppSnapshot[] = ['AgentSmith', 'Open Design', 'Headroom'].map((name, index) => ({
    id: String(index), name, description: '', directory: 'C:/app', packageManager: 'npm', script: 'dev',
    port: 3000, url: 'http://localhost:3000', activeUrl: 'http://localhost:3000', strategy: 'env', error: '',
    state: index === 0 ? 'running' : index === 1 ? 'stopped' : 'external',
  }))
  const api: AppsApi = { list: vi.fn(async () => ({ apps: records })), pick: vi.fn(), inspect: vi.fn(), save: vi.fn(),
    start: vi.fn(), stop: vi.fn(), logs: vi.fn(), remove: vi.fn(), confirmExternal: vi.fn() }
  const panels = new AppPanelsController(); panels.setActive('apps')
  const mounted = render(<AppsPanel appPanels={panels} api={api} t={key => zh[key]} />)
  try {
    await screen.findByRole('button', { name: '运行中 2' })
    fireEvent.click(screen.getByRole('button', { name: '已停止 1' }))
    const visible = screen.getAllByRole('article')
    expect(visible).toHaveLength(1)
    expect(visible[0]?.getAttribute('data-color')).toBe('1')
    expect(visible[0]?.querySelector('svg path')).toBeTruthy()
    expect(visible[0]?.textContent).toContain('3000 → AUTO')
    fireEvent.click(screen.getByRole('button', { name: '全部 3' }))
    expect(screen.getAllByRole('article')[2]?.textContent).toContain('HR')
  } finally { mounted.unmount() }
})
