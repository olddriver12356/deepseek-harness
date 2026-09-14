/**
 * The persistent application rail. Six entries, always visible, never
 * collapsing with the sidebar, because application navigation and session
 * navigation are separate axes.
 *
 * The component holds no panel state of its own: it reads and writes
 * ctx.appPanels, so a panel opened from somewhere else (a cross-panel handoff,
 * a command) marks the rail correctly without a second source of truth.
 */
import { useSyncExternalStore } from 'react'
import type { IAppPanels, PanelId } from '@deepseek-ai/dsh-client-ui-shell/client'
import css from './AppRail.module.css'
import { zh, type RailKey } from './locales.ts'

interface RailEntry {
  id: PanelId
  number: string
  label: RailKey
  caption: RailKey
}

/** Entry order, numbers, and copy are the legacy client's, which is the source of truth. */
const ENTRIES: readonly RailEntry[] = [
  { id: 'agent', number: '01', label: 'agent', caption: 'agentCaption' },
  { id: 'knowledge', number: '02', label: 'knowledge', caption: 'knowledgeCaption' },
  { id: 'skills', number: '03', label: 'skills', caption: 'skillsCaption' },
  { id: 'experts', number: '04', label: 'experts', caption: 'expertsCaption' },
  { id: 'styles', number: '05', label: 'styles', caption: 'stylesCaption' },
  { id: 'monitor', number: '06', label: 'monitor', caption: 'monitorCaption' },
  { id: 'apps', number: '07', label: 'apps', caption: 'appsCaption' },
  { id: 'news', number: '08', label: 'news', caption: 'newsCaption' },
]

/** Rail occupant. `appPanels` is passed in so the component stays testable without cordis. */
/** Keep News last when future pages are added. */
export function newsLast<T extends { id: string }>(entries: readonly T[]): T[] {
  return [...entries.filter(entry => entry.id !== 'news'), ...entries.filter(entry => entry.id === 'news')]
}

export function AppRail({ appPanels, t = (key: RailKey) => zh[key] }: { appPanels: IAppPanels; t?: (key: RailKey) => string }) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  return (
    <nav className={css.rail} role="tablist" aria-label={t('navigation')}>
      {newsLast(ENTRIES).map((entry, index) => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          data-panel={entry.id}
          aria-selected={entry.id === active}
          className={css.entry}
          onClick={() => { appPanels.setActive(entry.id) }}
        >
          <span className={css.number}>{String(index + 1).padStart(2, '0')}</span>
          <strong>{t(entry.label)}</strong>
          <small>{t(entry.caption)}</small>
        </button>
      ))}
    </nav>
  )
}
