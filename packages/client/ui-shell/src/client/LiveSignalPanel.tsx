/** Read-only Agent activity card. Mutations stay on their native surfaces until
 * the cross-surface commands (goal, trajectory, pending takeover, capture) have
 * explicit contracts. */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { contextOccupancyPercent, type PendingInteraction } from '@deepseek-ai/dsh-client-runtime/client'
import css from './LiveSignalPanel.module.css'
import type {} from '@deepseek-ai/dsh-token-meter/client'

type LiveSignalProps = PropsRuntime<'shell.activity'>

interface GoalProjectionLike { goal: { objective: string } }

function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}K`
  return `${Math.round(value / 100_000) / 10}M`
}

function pendingLabel(pending: readonly PendingInteraction[]): string {
  if (pending.length === 0) return '无待处理事项'
  const kinds = new Set(pending.map(item => item.kind))
  if (kinds.has('approval') && kinds.has('question')) return `${pending.length} 项待处理`
  if (kinds.has('approval')) return `${pending.length} 项待审批`
  return `${pending.length} 项待回答`
}

export function LiveSignalPanel({ sessionId, useSession, useProjection, useSessions }: LiveSignalProps) {
  const goal = useProjection('goal') as GoalProjectionLike | null | undefined
  const pressure = useProjection('contextPressure')
  const pending = useSession(snapshot => snapshot.pending)
  const session = useSessions(snapshot => snapshot.byId[sessionId])
  const usedTokens = pressure?.projectedTokens ?? pressure?.pressureTokens
  const contextPercent = contextOccupancyPercent(pressure)

  return (
    <aside className={css.panel} aria-label="活动信号" data-live-signal>
      <header className={css.header}>
        <span className={css.kicker}>LIVE SIGNAL</span>
        <span className={css.status} data-running={session?.running || undefined}>{session?.running ? '运行中' : '已就绪'}</span>
      </header>
      <div className={css.sessionName}>{session?.displayTitle ?? sessionId}</div>

      <section className={css.section} aria-labelledby="signal-goal">
        <div className={css.sectionHeader}>
          <span id="signal-goal">当前目标</span>
          <button type="button" className={css.disabledAction} disabled title="目标创建沿用 /goal 命令">设定目标</button>
        </div>
        <p className={goal?.goal.objective === undefined ? css.muted : css.value}>
          {goal?.goal.objective ?? '尚未设定目标'}
        </p>
      </section>

      <section className={css.section} aria-labelledby="signal-context">
        <div className={css.sectionHeader}><span id="signal-context">上下文</span><span className={css.mono}>{contextPercent === undefined ? '等待数据' : `${contextPercent}%`}</span></div>
        <div className={css.meter} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={contextPercent} aria-label="上下文使用率">
          <span style={{ width: `${contextPercent ?? 0}%` }} />
        </div>
        <div className={css.caption}>{usedTokens === undefined || pressure?.contextWindow === undefined ? '尚未收到 token 统计' : `约 ${formatTokens(usedTokens)} / ${formatTokens(pressure.contextWindow)} tokens`}</div>
      </section>

      <section className={css.section} aria-labelledby="signal-pending">
        <div className={css.sectionHeader}><span id="signal-pending">待处理</span><span className={pending.length > 0 ? css.alert : css.mono}>{pending.length}</span></div>
        <p className={pending.length > 0 ? css.value : css.muted}>{pendingLabel(pending)}</p>
      </section>

      <section className={css.section} aria-labelledby="signal-inspector">
        <div className={css.sectionHeader}><span id="signal-inspector">会话检查</span><button type="button" className={css.disabledAction} disabled title="轨迹 tab 选择 API 待定">查看完整轨迹 →</button></div>
        <p className={css.muted}>轨迹数据由原生 conversation.view 提供</p>
      </section>

      <button type="button" className={css.capture} disabled title="Milestone 3 Vault Remote 尚未接入">⇣ 沉淀本次对话<span>暂不可用</span></button>
    </aside>
  )
}
