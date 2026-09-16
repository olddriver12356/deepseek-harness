// @vitest-environment jsdom
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppPanelsController } from '../../ui-shell/src/client/app-panels.ts'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SkillArtifact, SkillFileContent, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { SkillsPanel, type SkillsApi } from '../src/client/SkillsPanel.tsx'
import { panelEn, type PanelTranslate } from '../src/client/panel-locales.ts'

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
const t: PanelTranslate = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), panelEn[key])
function setup(extraSkills: Partial<SkillArtifact>[] = []) {
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  const workspaceId = 'workspace' as WorkspaceId
  const workspaceState = { items: [{ workspaceId, title: 'Example', path: '/project', sessionIds: ['session'] }] }
  const sessionState = { current: 'session' }
  const workspaces = { list: { getSnapshot: () => workspaceState, subscribe: () => () => {} } } as unknown as IWorkspaces
  const sessions = { list: { getSnapshot: () => sessionState, subscribe: () => () => {} } } as unknown as ISessions
  const appPanels = new AppPanelsController()
  appPanels.setActive('skills')
  const item: SkillArtifact = { id: 'capture' as SkillArtifact['id'], name: 'capture', description: 'Capture sources', category: 'writing', scope: 'project', source: 'project-agents', path: '/project/.agents/skills/capture/SKILL.md', canonicalPath: '/project/.agents/skills/capture/SKILL.md', entryFile: 'SKILL.md', bundle: true, userInvocable: true, modelInvocable: true, shadowed: false, writable: true, problem: '' }
  const content: SkillFileContent = { file: 'SKILL.md', content: '---\nname: capture\ndescription: Capture sources\nmetadata:\n  category: writing\n---\nRead source', revision: 'revision', bytes: 100 }
  const run = vi.fn().mockResolvedValue(undefined)
  const api: SkillsApi = { list: vi.fn().mockResolvedValue({ skills: [item, ...extraSkills.map(skill => ({ ...item, ...skill }))], projectDestination: '/project/.agents/skills', personalDestination: '/user/.agents/skills' }), tree: vi.fn().mockResolvedValue([{ path: 'SKILL.md', kind: 'file' }, { path: 'references', kind: 'directory' }, { path: 'references/note.md', kind: 'file' }]), read: vi.fn().mockImplementation(async request => ({ ...content, file: request.file })), write: vi.fn().mockImplementation(async request => ({ ...content, content: request.content })), remove: vi.fn().mockResolvedValue({ recoveryPath: '/recovery/capture' }), handoff: vi.fn().mockReturnValue(run) }
  render(<SkillsPanel appPanels={appPanels} api={api} sessions={sessions} workspaces={workspaces} t={t} />)
  return { api, run }
}
it('searches names by default and includes descriptions only when selected', async () => {
  setup([
    { id: 'note' as SkillArtifact['id'], name: 'note', description: 'Polish writing', scope: 'personal' },
    { id: 'writer' as SkillArtifact['id'], name: 'writer', description: 'Create a note' },
  ])
  await screen.findByRole('button', { name: /^note/ })
  const search = screen.getByRole('textbox', { name: panelEn.search })
  fireEvent.change(search, { target: { value: ' /NOTE ' } })
  expect(screen.getByRole('button', { name: /^note/ })).toBeTruthy()
  expect(screen.queryByRole('button', { name: /^writer/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /^capture/ })).toBeNull()
  fireEvent.change(screen.getByRole('combobox', { name: panelEn.searchFields }), { target: { value: 'all' } })
  expect(screen.getByRole('button', { name: /^writer/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: /^note/ })).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: panelEn.scope }), { target: { value: 'personal' } })
  expect(screen.queryByRole('button', { name: /^writer/ })).toBeNull()
  expect(screen.getByRole('button', { name: /^note/ })).toBeTruthy()
})
it('animates the create dialog only after native opening and cancels without delaying reopening', async () => {
  enableMotion()
  setup()
  await screen.findByRole('button', { name: /^capture/ })
  expect(animate).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByRole('button', { name: /^capture/ })
  expect(animate).toHaveBeenCalledTimes(1)
  const showModal = vi.spyOn(HTMLDialogElement.prototype, 'showModal')
  fireEvent.click(screen.getByRole('button', { name: 'Create skill' }))
  const dialog = screen.getByRole<HTMLDialogElement>('dialog')
  expect(dialog.open).toBe(true)
  expect(showModal.mock.invocationCallOrder[0]).toBeLessThan(animate.mock.invocationCallOrder[1]!)
  expect(animate).toHaveBeenCalledTimes(2)
  fireEvent.change(screen.getByLabelText('What it does / Instruction draft'), { target: { value: 'Summarize notes' } })
  expect(animate).toHaveBeenCalledTimes(2)
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(dialog.isConnected).toBe(true)
  fireEvent(dialog, new Event('close'))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Create skill' }))
  expect(screen.getByRole<HTMLDialogElement>('dialog').open).toBe(true)
  expect(animate).toHaveBeenCalledTimes(3)
})
it('opens real files and preserves a failed save buffer before navigation', async () => {
  const { api } = setup()
  fireEvent.click(await screen.findByRole('button', { name: /^capture/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Fields' }))
  const name = await screen.findByLabelText('Name')
  fireEvent.change(name, { target: { value: 'renamed' } })
  vi.mocked(api.write).mockRejectedValueOnce(new Error('File changed externally'))
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'File changed externally')
  expect(screen.getByLabelText('Name')).toHaveProperty('value', 'renamed')
  fireEvent.click(screen.getByRole('button', { name: 'note.md' }))
  expect(await screen.findByRole('dialog', { name: 'You have unsaved changes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
  expect(screen.getByLabelText('Name')).toHaveProperty('value', 'renamed')
  expect(api.read).toHaveBeenCalledTimes(1)
})
it('shows category groups and creates a personal skill in the selected workspace session', async () => {
  const { api, run } = setup()
  expect(await screen.findByRole('button', { name: /writing.*1\/1/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Create skill' }))
  fireEvent.change(screen.getByLabelText('What it does / Instruction draft'), { target: { value: 'Summarize notes' } })
  const dialog = screen.getByRole('dialog')
  fireEvent.change(dialog.querySelector('select')!, { target: { value: 'personal' } })
  fireEvent.click(screen.getByRole('button', { name: 'Draft in new session' }))
  await waitFor(() => expect(run).toHaveBeenCalledOnce())
  expect(api.handoff).toHaveBeenCalledWith('workspace', expect.objectContaining({ name: '', instructions: 'Summarize notes', scope: 'personal' }), '/user/.agents/skills')
})

it('renders Markdown and preserves edits across preview and source views', async () => {
  setup()
  fireEvent.click(await screen.findByRole('button', { name: /^capture/ }))
  expect(await screen.findByRole('article', { name: 'Preview' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Source' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Source' }), { target: { value: '# Workflow\n\n- Read **carefully**' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
  expect(screen.getByRole('heading', { name: 'Workflow' })).toBeTruthy()
  expect(screen.getByRole('article', { name: 'Preview' }).querySelector('li')?.textContent).toBe('Read carefully')
  fireEvent.click(screen.getByRole('button', { name: 'Source' }))
  expect(screen.getByRole('textbox', { name: 'Source' })).toHaveProperty('value', '# Workflow\n\n- Read **carefully**')
})

it('confirms removal and reports the recovery path', async () => {
  const { api } = setup()
  fireEvent.click(await screen.findByRole('button', { name: 'Delete capture' }))
  fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
  expect(api.remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Delete capture' }))
  vi.mocked(api.list).mockResolvedValue({ skills: [], projectDestination: '', personalDestination: '' })
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(api.remove).toHaveBeenCalledWith({ workspaceId: 'workspace', id: 'capture', canonicalPath: '/project/.agents/skills/capture/SKILL.md' }))
  expect(await screen.findByText('/recovery/capture')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Delete capture' })).toBeNull()
})
