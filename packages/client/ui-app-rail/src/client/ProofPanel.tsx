/** Temporary fallback badge for application panels whose real shell.overlay plugin has not shipped. */
import { useSyncExternalStore } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import css from './ProofPanel.module.css'
import { zh, type RailKey } from './locales.ts'

const PANEL_KEYS: Readonly<Partial<Record<string, RailKey>>> = {
  agent: 'proofAgent',
  knowledge: 'proofKnowledge',
  experts: 'proofExperts',
  styles: 'proofStyles',
  monitor: 'proofMonitor',
  news: 'proofNews',
}

/** Floating proof badge. `appPanels` is passed in so the component stays testable without cordis. */
export function ProofPanel({ appPanels, t = (key: RailKey) => zh[key] }: { appPanels: IAppPanels; t?: (key: RailKey) => string }) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  if (active === 'agent' || active === 'knowledge' || active === 'skills' || active === 'monitor' || active === 'news' || active === 'personal') return null
  const key = PANEL_KEYS[active]
  return (
    <div className={css.proof} data-proof-panel data-active-panel={active}>
      {t('currentPanel')} {key === undefined ? active : t(key)}
    </div>
  )
}
