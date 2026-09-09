import React from 'react'
import { createRoot } from 'react-dom/client'
import { SkillsPanel, type SkillsApi } from '../../src/client/SkillsPanel.tsx'
import { AppPanelsController } from '../../../ui-shell/src/client/app-panels.ts'
import { AppRail } from '../../../ui-app-rail/src/client/AppRail.tsx'
import { ExpertsPanel } from '../../../ui-experts/src/client/ExpertsPanel.tsx'
import { en as expertEn } from '../../../ui-experts/src/client/locales.ts'
import { en as railEn } from '../../../ui-app-rail/src/client/locales.ts'
import { panelEn, type PanelTranslate } from '../../src/client/panel-locales.ts'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'

const panels = new AppPanelsController()
panels.setActive('skills')
const t: PanelTranslate = (key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), panelEn[key])
const workspaceState = { items: [{ workspaceId: 'browser-workspace', title: 'SecondBrain', path: '/fixture', sessionIds: ['session'] }] }
const sessionState = { current: 'session' }
const workspaces = { list: { getSnapshot: () => workspaceState, subscribe: () => () => {} } } as unknown as IWorkspaces
const sessions = { list: { getSnapshot: () => sessionState, subscribe: () => () => {} } } as unknown as ISessions
async function call<T>(method: string, payload: unknown): Promise<T> {
  const response = await fetch(`/api/${method}`, { method: 'POST', body: JSON.stringify(payload) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error)
  return result
}
const api: SkillsApi = { list: () => call('list', {}), tree: (_workspace, id) => call('tree', { id }), read: request => call('read', request), write: request => call('write', request), handoff: () => async () => {} }
const experts = [
  { name: 'Systems thinker', description: 'Trace dependencies. Make tradeoffs explicit.' },
  { name: 'Research partner', description: 'Follow evidence. Keep uncertainty visible.' },
  { name: 'Writing editor', description: 'Find the central idea. Say it clearly.' },
].map((item, i) => ({ ...item, id: `expert-${i}`, category: 'Thinking', instructions: item.description, status: 'approved' as const, skills: [], model: 'inherit', reasoning: 'inherit', permission: 'inherit', created: '', updated: '' }))
createRoot(document.getElementById('root')!).render(<div style={{ display: 'grid', gridTemplateColumns: '104px minmax(0, 1fr)', height: '100vh' }}><AppRail appPanels={panels} t={key => railEn[key]} /><div style={{ minWidth: 0, minHeight: 0 }}><SkillsPanel appPanels={panels} workspaces={workspaces} sessions={sessions} api={api} t={t} /><ExpertsPanel appPanels={panels} t={(key, params) => Object.entries(params ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), expertEn[key])} api={{ list: async () => experts, listStyles: async () => [], create: async () => { throw new Error('Fixture is read-only') }, update: async () => { throw new Error('Fixture is read-only') }, remove: async () => {}, dispatch: async () => {} }} /></div></div>)
document.body.style.margin = '0'
document.body.style.background = '#101416'
