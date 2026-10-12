import type { WorkspaceId } from '../../../../../packages/api/workspace-controller/src/types.ts'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { SkillsPanel, type SkillsApi } from '../../../../../packages/client/ui-skill/src/client/SkillsPanel.tsx'
import { AppPanelsController } from '../../../../../packages/client/ui-shell/src/client/app-panels.ts'
import { AppRail } from '../../../../../packages/client/ui-app-rail/src/client/AppRail.tsx'
import { ExpertsPanel } from '../../../../../packages/client/ui-experts/src/client/ExpertsPanel.tsx'
import { en as expertEn } from '../../../../../packages/client/ui-experts/src/client/locales.ts'
import { en as railEn } from '../../../../../packages/client/ui-app-rail/src/client/locales.ts'
import { panelEn, type PanelTranslate } from '../../../../../packages/client/ui-skill/src/client/panel-locales.ts'
import type { WorkspaceSnapshot } from '../../../../../packages/api/workspace-controller/src/client/index.ts'
import type { SessionListState } from '../../../../../packages/api/session-controller/src/client/index.ts'
type SessionId = SessionListState['ids'][number]

const panels = new AppPanelsController()
panels.setActive('skills')
const t: PanelTranslate = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), panelEn[key])
const workspaceState: WorkspaceSnapshot = { archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null, items: [{ workspaceId: 'browser-workspace' as WorkspaceId, title: 'SecondBrain', path: '/fixture', sessionIds: ['session' as SessionId], createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }] }
const sessionId = 'session' as SessionId
const sessionState: SessionListState = {
  ids: [sessionId], phase: 'ready', projectionsBySession: {},
  byId: { [sessionId]: { id: sessionId, displayTitle: 'Session', running: false, blank: false, updatedAt: 1, retainedBy: { mainView: 1 } } },
}
const workspaces = { list: { getSnapshot: () => workspaceState, subscribe: () => () => {} } }
const sessions = { list: { getSnapshot: () => sessionState, subscribe: () => () => {} } }
async function call<T>(method: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/${method}`, { method: 'POST', body: JSON.stringify(payload) })
  const result: unknown = await response.json()
  if (!response.ok) throw new Error(typeof result === 'object' && result !== null && 'error' in result ? String(result.error) : response.statusText)
  return result as T
}
const api: SkillsApi = { list: () => call('list', {}), tree: (_workspace, id) => call('tree', { id }), read: request => call('read', request), write: request => call('write', request), remove: request => call('remove', request), handoff: () => async () => {}, handoffTool: () => async () => {} }
api.catalog = async () => ({
  commands: [{ id: 'command-fixture', name: '/fixture-command', description: 'Browser fixture command', source: 'Current session', status: 'Available', detail: '/fixture-command' }],
  mcp: [{ id: 'mcp-fixture', name: 'mcp-fixture', description: 'Browser fixture MCP client', source: 'Host', status: 'Plugin active', detail: '@deepseek-ai/dsh-mcp-client' }],
  hooks: [{ id: 'hook-fixture', name: 'hook-fixture', description: 'Browser fixture hook bridge', source: 'Host', status: 'Configured', detail: '@deepseek-ai/dsh-hooks-codex' }],
  plugins: [{ id: 'plugin-fixture', name: 'plugin-fixture', description: 'Browser fixture plugin', source: 'Host', status: 'Plugin active', detail: '@deepseek-ai/dsh-fixture' }],
})
const experts = [
  { name: 'Systems thinker', description: 'Trace dependencies. Make tradeoffs explicit.' },
  { name: 'Research partner', description: 'Follow evidence. Keep uncertainty visible.' },
  { name: 'Writing editor', description: 'Find the central idea. Say it clearly.' },
].map((item, i) => ({ ...item, id: `expert-${i}`, category: 'Thinking', instructions: item.description, status: 'approved' as const, skills: [], model: 'inherit', reasoning: 'inherit', permission: 'inherit', updatedAt: '' }))
createRoot(document.getElementById('root')!).render(<div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', height: '100vh' }}><AppRail appPanels={panels} t={key => railEn[key]} /><div style={{ minWidth: 0, minHeight: 0 }}><SkillsPanel appPanels={panels} workspaces={workspaces} sessions={sessions} api={api} t={t} /><ExpertsPanel appPanels={panels} t={(key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), expertEn[key])} api={{ list: async () => experts, listStyles: async () => [], create: async () => { throw new Error('Fixture is read-only') }, update: async () => { throw new Error('Fixture is read-only') }, remove: async () => {}, dispatch: async () => {} }} /></div></div>)
document.body.style.margin = '0'
document.body.style.background = '#101416'
