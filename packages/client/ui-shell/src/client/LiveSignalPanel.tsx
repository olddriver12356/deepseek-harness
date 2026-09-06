/** Read-only Agent activity card. Mutations stay on their native surfaces until
 * the cross-surface commands (goal, trajectory, pending takeover, capture) have
 * explicit contracts. */
import { useState } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActivityInjected, GoalActionResult } from './index.ts'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import { contextOccupancy } from '@deepseek-ai/dsh-token-meter/client'
import css from './LiveSignalPanel.module.css'
import type {} from '@deepseek-ai/dsh-token-meter/client'
// Type-only: merges ui-trajectory's ConversationViewSnapshotMap row so
// `views.get('trajectory')` reads the canonical trajectory target.
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'

type LiveSignalProps = PropsRuntime<'shell.activity'> & InjectFace<ActivityInjected>

/** The slice of the `goal` projection this card reads; the goal domain owns the full shape. */
interface GoalProjectionLike {
  goal: {
    objective: string
    phase: 'active' | 'paused' | 'blocked' | 'complete'
    blockedReason?: { message: string }
    maxGoalRounds: number
  }
  roundsStarted: number
}

const GOAL_PHASE_LABEL: Readonly<Record<GoalProjectionLike['goal']['phase'], string>> = {
  active: '进行中',
  paused: '已暂停',
  blocked: '受阻',
  complete: '已完成',
}

/** Bar segments in draw order; the heuristic breakdown only proportions the
 * provider-anchored occupancy, so these are composition, never a total. */
const COMPOSITION = [
  { key: 'systemTokens', label: '系统', color: css.partSystem },
  { key: 'toolsTokens', label: '工具', color: css.partTools },
  { key: 'messageTokens', label: '对话', color: css.partMessages },
] as const

function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}K`
  return `${Math.round(value / 100_000) / 10}M`
}

function pendingLabel(pending: SessionPendingInteraction | undefined): string {
  if (pending === undefined) return '无待处理事项'
  if (pending.kind === 'approval') return '1 项待审批'
  if (pending.kind === 'question') return '1 项待回答'
  return '1 项待处理'
}

/**
 * The goal block: the projected goal with the verbs its current phase admits. Creation is absent
 * on purpose. The Goal Remote has no create verb, so a session with no goal points at `/goal`
 * rather than offering a control that cannot work.
 */
function GoalSection({ goal, onEditGoal, onPauseGoal, onResumeGoal, onClearGoal }: {
  readonly goal: GoalProjectionLike | null | undefined
} & ActivityInjected) {
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const run = async (verb: () => Promise<GoalActionResult>, done?: () => void): Promise<void> => {
    setPending(true)
    setError('')
    try {
      const result = await verb()
      if (result.ok) done?.()
      else setError(result.error.message)
    } finally {
      setPending(false)
    }
  }

  if (goal == null) {
    return (
      <section className={css.section} aria-labelledby="signal-goal">
        <div className={css.sectionHeader}><span id="signal-goal">当前目标</span></div>
        <p className={css.muted}>尚未设定目标。创建目标请在输入框使用 /goal 命令，此处只负责改动已有目标。</p>
      </section>
    )
  }

  const { phase, objective, blockedReason, maxGoalRounds } = goal.goal
  return (
    <section className={css.section} aria-labelledby="signal-goal">
      <div className={css.sectionHeader}>
        <span id="signal-goal">当前目标</span>
        <span className={css.mono}>{GOAL_PHASE_LABEL[phase]} · {goal.roundsStarted}/{maxGoalRounds} 轮</span>
      </div>
      {draft === undefined
        ? <p className={css.value}>{objective}</p>
        : (
          <>
            <textarea
              aria-label="目标内容"
              className={css.draft}
              onChange={(event) => { setDraft(event.target.value) }}
              rows={3}
              value={draft}
            />
            <div className={css.actions}>
              <button
                className={css.action}
                disabled={pending || draft.trim() === ''}
                onClick={() => { void run(async () => await onEditGoal(draft.trim()), () => { setDraft(undefined) }) }}
                type="button"
              >
                保存
              </button>
              <button className={css.action} onClick={() => { setDraft(undefined) }} type="button">取消</button>
            </div>
          </>
        )}
      {phase === 'blocked' && blockedReason !== undefined && <p className={css.alertLine}>受阻原因：{blockedReason.message}</p>}
      {draft === undefined && (
        <div className={css.actions}>
          <button className={css.action} disabled={pending} onClick={() => { setDraft(objective) }} type="button">编辑</button>
          {phase === 'active' && (
            <button className={css.action} disabled={pending} onClick={() => { void run(onPauseGoal) }} type="button">暂停</button>
          )}
          {phase === 'paused' && (
            <button className={css.action} disabled={pending} onClick={() => { void run(onResumeGoal) }} type="button">继续</button>
          )}
          <button className={css.action} disabled={pending} onClick={() => { void run(onClearGoal) }} type="button">清除</button>
        </div>
      )}
      {error !== '' && <p className={css.alertLine} role="alert">{error}</p>}
    </section>
  )
}

export function LiveSignalPanel({
  sessionId, useProjection, useSessions, useSessionPendingInteraction, useConversation,
  onEditGoal, onPauseGoal, onResumeGoal, onClearGoal,
}: LiveSignalProps) {
  const goal = useProjection('goal') as GoalProjectionLike | null | undefined
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const usage = useProjection('tokenUsage')
  const pending = useSessionPendingInteraction(map => map.get(sessionId))
  const session = useSessions(snapshot => snapshot.byId[sessionId])
  const trajectory = useConversation(snapshot => snapshot.views.get('trajectory'))
  const context = contextOccupancy(pressure)
  const contextPercent = context?.percent

  // The bar's overall length stays the provider-exact percent; the heuristic
  // breakdown only proportions its coloured parts. Zero-width parts are dropped
  // so a hairline never draws over an empty context.
  const compositionTotal = breakdown === undefined
    ? 0
    : breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens
  const parts = breakdown === undefined || compositionTotal === 0 || contextPercent === undefined
    ? []
    : COMPOSITION
      .map(part => ({ ...part, width: contextPercent * breakdown[part.key] / compositionTotal }))
      .filter(part => part.width > 0)

  const cacheBase = usage === undefined ? 0 : usage.uncachedInputTokens + usage.cacheReadTokens
  const trajectoryFigures = trajectory === undefined ? undefined : {
    events: trajectory.eventNodes.length,
    requests: trajectory.requests.length,
    running: trajectory.requests.filter(r => r.status === 'running').length + trajectory.runningCalls.length,
    failed: trajectory.requests.filter(r => r.status === 'error').length,
    latest: trajectory.eventNodes.reduce((max, node) => Math.max(max, node.time), 0),
  }

  return (
    <aside className={css.panel} aria-label="活动信号" data-live-signal>
      <header className={css.header}>
        <span className={css.kicker}>LIVE SIGNAL</span>
        <span className={css.status} data-running={session?.running || undefined}>{session?.running ? '运行中' : '已就绪'}</span>
      </header>
      <div className={css.sessionName}>{session?.displayTitle ?? sessionId}</div>

      <GoalSection
        goal={goal}
        onClearGoal={onClearGoal}
        onEditGoal={onEditGoal}
        onPauseGoal={onPauseGoal}
        onResumeGoal={onResumeGoal}
      />

      <section className={css.section} aria-labelledby="signal-context">
        <div className={css.sectionHeader}><span id="signal-context">上下文</span><span className={css.mono}>{contextPercent === undefined ? '等待数据' : `${contextPercent}%`}</span></div>
        <div className={css.meter} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={contextPercent} aria-label="上下文使用率">
          {parts.length === 0
            ? <span style={{ width: `${contextPercent ?? 0}%` }} />
            : parts.map(part => <span key={part.key} className={part.color} style={{ width: `${part.width}%` }} />)}
        </div>
        <div className={css.caption}>
          {context === null
            ? '尚未收到 token 统计'
            : `约 ${formatTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)} tokens`}
        </div>
        {breakdown !== undefined && compositionTotal > 0 && (
          <dl className={css.legend}>
            {COMPOSITION.map(part => (
              <div key={part.key} className={css.legendRow}>
                <dt><span className={`${css.swatch} ${part.color}`} aria-hidden />{part.label}</dt>
                <dd>{`~${formatTokens(breakdown[part.key])}`}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className={css.section} aria-labelledby="signal-usage">
        <div className={css.sectionHeader}>
          <span id="signal-usage">累计用量</span>
          <span className={css.mono}>{usage === undefined || cacheBase === 0 ? '—' : `缓存命中 ${Math.round(usage.cacheReadTokens * 100 / cacheBase)}%`}</span>
        </div>
        {usage === undefined
          ? <p className={css.muted}>尚未收到用量统计</p>
          : (
            <dl className={css.legend}>
              <div className={css.legendRow}><dt>输入</dt><dd>{formatTokens(usage.uncachedInputTokens)}</dd></div>
              <div className={css.legendRow}><dt>输出</dt><dd>{formatTokens(usage.outputTokens)}</dd></div>
              <div className={css.legendRow}><dt>缓存读 / 写</dt><dd>{`${formatTokens(usage.cacheReadTokens)} / ${formatTokens(usage.cacheWriteTokens)}`}</dd></div>
            </dl>
          )}
      </section>

      <section className={css.section} aria-labelledby="signal-pending">
        <div className={css.sectionHeader}><span id="signal-pending">待处理</span><span className={pending === undefined ? css.mono : css.alert}>{pending === undefined ? 0 : 1}</span></div>
        <p className={pending === undefined ? css.muted : css.value}>{pendingLabel(pending)}</p>
      </section>

      <section className={css.section} aria-labelledby="signal-inspector">
        <div className={css.sectionHeader}><span id="signal-inspector">运行轨迹</span><span className={css.mono}>CONVERSATION.VIEW</span></div>
        {trajectoryFigures === undefined
          ? <p className={css.muted}>轨迹 view target 尚未装载</p>
          : (
            <>
              <div className={css.figures}>
                {([
                  ['事件', trajectoryFigures.events],
                  ['请求', trajectoryFigures.requests],
                  ['进行中', trajectoryFigures.running],
                  ['失败', trajectoryFigures.failed, trajectoryFigures.failed > 0],
                ] as const).map(([label, value, alert]) => (
                  <div className={css.figure} key={label} data-alert={alert === true || undefined}>
                    <span>{label}</span><b>{value}</b>
                  </div>
                ))}
              </div>
              <div className={css.caption}>
                {trajectoryFigures.latest === 0
                  ? '尚无轨迹事件 · 完整三模式轨迹见上方「轨迹」标签'
                  : `最近事件 ${new Date(trajectoryFigures.latest).toLocaleTimeString()} · 完整三模式轨迹见上方「轨迹」标签`}
              </div>
            </>
          )}
      </section>

      <button type="button" className={css.capture} disabled title="Milestone 3 Vault Remote 尚未接入">⇣ 沉淀本次对话<span>暂不可用</span></button>
    </aside>
  )
}
