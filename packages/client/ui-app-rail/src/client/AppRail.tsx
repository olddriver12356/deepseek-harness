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

interface RailEntry {
  id: PanelId
  number: string
  label: string
  caption: string
}

/** Entry order, numbers, and copy are the legacy client's, which is the source of truth. */
const ENTRIES: readonly RailEntry[] = [
  { id: 'agent', number: '01', label: 'AGENT', caption: '执行现场' },
  { id: 'knowledge', number: '02', label: '知识库', caption: '第二大脑' },
  { id: 'experts', number: '03', label: '专家', caption: '调用阵容' },
  { id: 'styles', number: '04', label: '风格', caption: '输出声线' },
  { id: 'monitor', number: '05', label: '监控', caption: '用量与轨迹' },
  { id: 'news', number: '06', label: '新闻', caption: 'AI 动态与工具' },
]

/** Rail occupant. `appPanels` is passed in so the component stays testable without cordis. */
export function AppRail({ appPanels }: { appPanels: IAppPanels }) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  return (
    <nav className={css.rail} role="tablist" aria-label="主要导航">
      {ENTRIES.map(entry => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          data-panel={entry.id}
          aria-selected={entry.id === active}
          className={css.entry}
          onClick={() => { appPanels.setActive(entry.id) }}
        >
          <span className={css.number}>{entry.number}</span>
          <strong>{entry.label}</strong>
          <small>{entry.caption}</small>
        </button>
      ))}
    </nav>
  )
}
