// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppPanelsController } from '../../ui-shell/src/client/app-panels.ts'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SkillArtifact, SkillFileContent, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { SkillsPanel, type SkillsApi } from '../src/client/SkillsPanel.tsx'
import { panelEn, type PanelTranslate } from '../src/client/panel-locales.ts'

afterEach(cleanup)
const t: PanelTranslate = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), panelEn[key])
function setup() {
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
  const api: SkillsApi = { list: vi.fn().mockResolvedValue({ skills: [item], projectDestination: '/project/.agents/skills', personalDestination: '/user/.agents/skills' }), tree: vi.fn().mockResolvedValue([{ path: 'SKILL.md', kind: 'file' }, { path: 'references', kind: 'directory' }, { path: 'references/note.md', kind: 'file' }]), read: vi.fn().mockImplementation(async request => ({ ...content, file: request.file })), write: vi.fn().mockImplementation(async request => ({ ...content, content: request.content })), handoff: vi.fn().mockReturnValue(run) }
  render(<SkillsPanel appPanels={appPanels} api={api} sessions={sessions} workspaces={workspaces} t={t} />)
  return { api, run }
}
it('opens real files and preserves a failed save buffer before navigation', async () => {
  const { api } = setup()
  fireEvent.click(await screen.findByRole('button', { name: /capture/ }))
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
