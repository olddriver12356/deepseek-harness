/** Read-only Agent activity card. Mutations stay on their native surfaces until
 * the cross-surface commands (goal, trajectory, pending takeover, capture) have
 * explicit contracts. */
import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ActivityInjected, GoalActionResult } from './index.ts'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'
import { contextOccupancy } from '@deepseek-ai/dsh-token-meter/client'
import css from './LiveSignalPanel.module.css'
import type {} from '@deepseek-ai/dsh-token-meter/client'

type LiveSignalProps =
  PropsRuntime<'shell.activity'>
  & PropsRenderSlots<'shell.activity.selectors'>
  & PropsRenderSlots<'shell.activity.capture'>
  & PropsRenderSlots<'shell.activity.progress'>
  & InjectFace<ActivityInjected>
  & PropsLocale<'shell'>

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

const GOAL_PHASE_KEYS = {
  active: 'goalActive',
  paused: 'goalPaused',
  blocked: 'goalBlocked',
  complete: 'goalComplete',
} as const

/** Bar segments in draw order; the heuristic breakdown only proportions the
 * provider-anchored occupancy, so these are composition, never a total. */
const COMPOSITION = [
  { key: 'systemTokens', labelKey: 'system', color: css.partSystem },
  { key: 'toolsTokens', labelKey: 'tools', color: css.partTools },
  { key: 'messageTokens', labelKey: 'messages', color: css.partMessages },
] as const

function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}K`
  return `${Math.round(value / 100_000) / 10}M`
}

function pendingLabel(pending: SessionPendingInteraction | undefined, t: PropsLocale<'shell'>['t']): string {
  if (pending === undefined) return t('noPending')
  if (pending.kind === 'approval') return t('approvalPending')
  if (pending.kind === 'question') return t('questionPending')
  return t('interactionPending')
}

/**
 * The goal block: the projected goal with the verbs its current phase admits. Creation is absent
 * on purpose. The Goal Remote has no create verb, so a session with no goal points at `/goal`
 * rather than offering a control that cannot work.
 */
function GoalSection({ goal, onEditGoal, onPauseGoal, onResumeGoal, onClearGoal, t }: {
  readonly goal: GoalProjectionLike | null | undefined
} & ActivityInjected & PropsLocale<'shell'>) {
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
        <div className={css.sectionHeader}><span id="signal-goal">{t('currentGoal')}</span></div>
        <p className={css.muted}>{t('noGoal')}</p>
      </section>
    )
  }

  const { phase, objective, blockedReason, maxGoalRounds } = goal.goal
  return (
    <section className={css.section} aria-labelledby="signal-goal">
      <div className={css.sectionHeader}>
        <span id="signal-goal">{t('currentGoal')}</span>
        <span className={css.mono}>{t(GOAL_PHASE_KEYS[phase])} · {goal.roundsStarted}/{maxGoalRounds} {t('rounds')}</span>
      </div>
      {draft === undefined
        ? <p className={css.value}>{objective}</p>
        : (
          <>
            <textarea
              aria-label={t('goalObjective')}
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
                {t('save')}
              </button>
              <button className={css.action} onClick={() => { setDraft(undefined) }} type="button">{t('cancel')}</button>
            </div>
          </>
        )}
      {phase === 'blocked' && blockedReason !== undefined && <p className={css.alertLine}>{t('blockedReason')}{blockedReason.message}</p>}
      {draft === undefined && (
        <div className={css.actions}>
          <button className={css.action} disabled={pending} onClick={() => { setDraft(objective) }} type="button">{t('edit')}</button>
          {phase === 'active' && (
            <button className={css.action} disabled={pending} onClick={() => { void run(onPauseGoal) }} type="button">{t('pause')}</button>
          )}
          {phase === 'paused' && (
            <button className={css.action} disabled={pending} onClick={() => { void run(onResumeGoal) }} type="button">{t('resume')}</button>
          )}
          <button className={css.action} disabled={pending} onClick={() => { void run(onClearGoal) }} type="button">{t('clear')}</button>
        </div>
      )}
      {error !== '' && <p className={css.alertLine} role="alert">{error}</p>}
    </section>
  )
}

export function LiveSignalPanel({
  sessionId, useProjection, useSessions, useSessionStatus, renderSlot, t,
  onEditGoal, onPauseGoal, onResumeGoal, onClearGoal,
}: LiveSignalProps) {
  const goal = useProjection('goal') as GoalProjectionLike | null | undefined
  const pressure = useProjection('contextPressure')
  const breakdown = useProjection('contextBreakdown')
  const usage = useProjection('tokenUsage')
  const pending = useSessionStatus(map => map.get(sessionId)?.pendingInteraction)
  const session = useSessions(snapshot => snapshot.byId[sessionId])
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

  return (
    <aside className={css.panel} aria-label={t('activityAria')} data-live-signal>
      <header className={css.header}>
        <span className={css.kicker}>{t('activityHeading')}</span>
        <span className={css.status} data-running={session?.running || undefined}>{session?.running ? t('running') : t('ready')}</span>
      </header>
      <div className={css.sessionName}>{session?.displayTitle ?? sessionId}</div>

      <GoalSection
        t={t}
        goal={goal}
        onClearGoal={onClearGoal}
        onEditGoal={onEditGoal}
        onPauseGoal={onPauseGoal}
        onResumeGoal={onResumeGoal}
      />

      {renderSlot('shell.activity.progress', {})}
      {renderSlot('shell.activity.selectors', {})}

      <section className={css.section} aria-labelledby="signal-pending">
        <div className={css.sectionHeader}><span id="signal-pending">{t('pending')}</span><span className={pending === undefined ? css.mono : css.alert}>{pending === undefined ? 0 : 1}</span></div>
        <p className={pending === undefined ? css.muted : css.value}>{pendingLabel(pending, t)}</p>
      </section>

      <section className={css.section} aria-labelledby="signal-context">
        <div className={css.sectionHeader}><span id="signal-context">{t('context')}</span><span className={css.mono}>{contextPercent === undefined ? t('waiting') : `${contextPercent}%`}</span></div>
        <div className={css.meter} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={contextPercent} aria-label={t('contextUsage')}>
          {parts.length === 0
            ? <span style={{ width: `${contextPercent ?? 0}%` }} />
            : parts.map(part => <span key={part.key} className={part.color} style={{ width: `${part.width}%` }} />)}
        </div>
        <div className={css.caption}>
          {context === null
            ? t('noTokenStats')
            : t('contextTokens', { used: formatTokens(context.usedTokens), window: formatTokens(context.contextWindow) })}
        </div>
        {breakdown !== undefined && compositionTotal > 0 && (
          <dl className={css.legend}>
            {COMPOSITION.map(part => (
              <div key={part.key} className={css.legendRow}>
                <dt><span className={`${css.swatch} ${part.color}`} aria-hidden />{t(part.labelKey)}</dt>
                <dd>{`~${formatTokens(breakdown[part.key])}`}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className={css.section} aria-labelledby="signal-usage">
        <div className={css.sectionHeader}>
          <span id="signal-usage">{t('totalUsage')}</span>
          <span className={css.mono}>{usage === undefined || cacheBase === 0 ? '—' : t('cacheHit', { percent: Math.round(usage.cacheReadTokens * 100 / cacheBase) })}</span>
        </div>
        {usage === undefined
          ? <p className={css.muted}>{t('noUsageStats')}</p>
          : (
            <dl className={css.legend}>
              <div className={css.legendRow}><dt>{t('input')}</dt><dd>{formatTokens(usage.uncachedInputTokens)}</dd></div>
              <div className={css.legendRow}><dt>{t('output')}</dt><dd>{formatTokens(usage.outputTokens)}</dd></div>
              <div className={css.legendRow}><dt>{t('cacheReadWrite')}</dt><dd>{`${formatTokens(usage.cacheReadTokens)} / ${formatTokens(usage.cacheWriteTokens)}`}</dd></div>
            </dl>
          )}
      </section>

      {renderSlot('shell.activity.capture', { className: css.capture })}
    </aside>
  )
}
