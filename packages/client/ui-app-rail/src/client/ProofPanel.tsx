/**
 * Temporary proof panel: renders the active ctx.appPanels value over the
 * Agent columns without unmounting them, fulfilling the task brief's stated
 * deliverable ahead of the real panel shells (a later plan). Delete this file
 * and its registration once shell.overlay carries real panel occupants.
 */
import { useSyncExternalStore } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import css from './ProofPanel.module.css'

const LABELS: Record<string, string> = {
  agent: 'AGENT 执行现场',
  knowledge: '知识库 第二大脑',
  experts: '专家 调用阵容',
  styles: '风格 输出声线',
  monitor: '监控 用量与轨迹',
  news: '新闻 AI 动态与工具',
}

/** Floating proof badge. `appPanels` is passed in so the component stays testable without cordis. */
export function ProofPanel({ appPanels }: { appPanels: IAppPanels }) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  return (
    <div className={css.proof} data-proof-panel data-active-panel={active}>
      当前面板: {LABELS[active] ?? active}
    </div>
  )
}
