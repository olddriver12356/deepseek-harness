// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AppsPanel, type AppsApi } from '../src/client/AppsPanel.tsx'
import { zh } from '../src/client/locales.ts'
import type { ProjectInspection } from '../../../host/apps/src/types.ts'
import { AppPanelsController } from '../../ui-shell/src/client/app-panels.ts'

it('opens registration from the empty state using the workspace picker', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  const api: AppsApi = { list: vi.fn(async () => ({ apps: [] })), pick: vi.fn(async () => 'C:/app'), inspect: vi.fn(async (): Promise<ProjectInspection> => ({ directory: 'C:/app', name: 'Example', scripts: { dev: 'vite' }, packageManagers: ['npm'] })), save: vi.fn(), start: vi.fn(), stop: vi.fn(), logs: vi.fn(), remove: vi.fn(), confirmExternal: vi.fn() }
  const panels = new AppPanelsController(); panels.setActive('apps')
  const mounted = render(<AppsPanel appPanels={panels} api={api} t={key => zh[key]} />)
  fireEvent.click(screen.getByRole('button', { name: /注册应用$/ }))
  await waitFor(() => expect(screen.getByDisplayValue('Example')).toBeTruthy())
  expect(api.pick).toHaveBeenCalledOnce()
  expect(screen.getByDisplayValue('dev')).toBeTruthy()
  mounted.unmount()
})
