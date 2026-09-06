import { useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { MaybeSnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { contextOccupancy } from '@deepseek-ai/dsh-token-meter/client'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-token-meter/client'
// Type-only: merges ui-trajectory's ConversationViewSnapshotMap row so
// `views.get('trajectory')` reads the canonical trajectory target.
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client'
import css from './MonitorPanel.module.css'

/** One adapter-owned reasoning level, as the host's model catalog reports it. */
export interface MonitorEffortLevel {
  readonly id: string
  readonly name: string
  readonly description?: string
}

/**
 * The model-directory slice this panel reads. Declared structurally rather
 * than imported from ui-model-selection: the effort selector shares that
 * plugin's per-session state through the `modelDirectories` cordis service,
 * never through a cross-plugin value import.
 */
export interface MonitorDirectoryState {
  readonly current: {
    readonly provider: string
    readonly model: string
    readonly reasoningEffort?: string
  } | null
  readonly groups: readonly {
    readonly id: string
    readonly models: readonly {
      readonly id: string
      readonly name: string
      readonly reasoning?: {
        readonly defaultEffort?: string
        readonly efforts: readonly MonitorEffortLevel[]
      }
    }[]
  }[]
  readonly status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  readonly error: string | null
}

/**
 * Session-bound handle over the SAME ModelDirectory the composer's model seat
 * and the /model popup drive, so an effort switch made here is what they show
 * next. Identity is stable per session (the wiring layer caches it), which is
 * what makes it safe to pass into useSyncExternalStore and an effect.
 */
export interface MonitorEffortAccess {
  readonly subscribe: (listener: () => void) => () => void
  readonly getState: () => MonitorDirectoryState
  readonly load: () => void
  readonly select: (effortId: string | undefined) => void
}

export interface MonitorPanelProps {
  readonly appPanels: IAppPanels
  readonly useConversation: MaybeSnapshotSelectorHook<ConversationSnapshot>
  readonly useProjection: UseProjection
  /** Absent with no current session, or when ui-model-selection is not loaded. */
  readonly effort?: MonitorEffortAccess | undefined
}

function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}K`
  return `${Math.round(value / 100_000) / 10}M`
}

function StatCard({ title, label, children }: { readonly title: string; readonly label: string; readonly children: ReactNode }): ReactNode {
  return (
    <article className={css.card}>
      <header className={css.cardHeader}><h2>{title}</h2><span>{label}</span></header>
      {children}
    </article>
  )
}

interface UsageStatsTotals {
  readonly tokens: number
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
  readonly sessions: number
  readonly messages: number
  readonly activeDays: number
  readonly currentStreak: number
}

interface UsageStatsMostUsedModel {
  readonly key: string
  readonly provider: string
  readonly model: string
  readonly percent: number
}

interface UsageStatsDay {
  readonly date: string
  readonly tokens: number
  readonly calls: number
  readonly models: Readonly<Record<string, number>>
}

interface UsageStatsSnapshot {
  readonly totals: UsageStatsTotals
  readonly mostUsedModel: UsageStatsMostUsedModel | undefined
  readonly days: readonly UsageStatsDay[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function usageStatsTotals(value: unknown): UsageStatsTotals | undefined {
  if (!isRecord(value)) return undefined
  const tokens = numberField(value, 'tokens')
  const sessions = numberField(value, 'sessions')
  const messages = numberField(value, 'messages')
  const activeDays = numberField(value, 'activeDays')
  const currentStreak = numberField(value, 'currentStreak')
  if (tokens === undefined || sessions === undefined || messages === undefined
    || activeDays === undefined || currentStreak === undefined) return undefined
  return {
    tokens, sessions, messages, activeDays, currentStreak,
    input: numberField(value, 'input') ?? 0,
    output: numberField(value, 'output') ?? 0,
    cacheRead: numberField(value, 'cacheRead') ?? 0,
    cacheWrite: numberField(value, 'cacheWrite') ?? 0,
  }
}

function usageStatsMostUsedModel(value: unknown): UsageStatsMostUsedModel | undefined {
  if (!isRecord(value)) return undefined
  const key = value.key
  const provider = value.provider
  const model = value.model
  const percent = numberField(value, 'percent')
  if (typeof key !== 'string' || typeof provider !== 'string' || typeof model !== 'string' || percent === undefined) return undefined
  return { key, provider, model, percent }
}

function usageStatsModels(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) return {}
  const result: Record<string, number> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) result[key] = entry
  }
  return result
}

function usageStatsDay(value: unknown): UsageStatsDay | undefined {
  if (!isRecord(value) || typeof value.date !== 'string') return undefined
  const tokens = numberField(value, 'tokens')
  const calls = numberField(value, 'calls')
  if (tokens === undefined || calls === undefined) return undefined
  return { date: value.date, tokens, calls, models: usageStatsModels(value.models) }
}

/** Parses `dsh-usage-stats`'s `/usage-stats/v1/snapshot` response — the SAME endpoint the standalone 使用统计 page reads. */
function parseUsageStatsSnapshot(value: unknown): UsageStatsSnapshot | undefined {
  if (!isRecord(value)) return undefined
  const totals = usageStatsTotals(value.totals)
  if (totals === undefined) return undefined
  const days = Array.isArray(value.days)
    ? value.days.map(usageStatsDay).filter((day): day is UsageStatsDay => day !== undefined)
    : []
  return { totals, mostUsedModel: usageStatsMostUsedModel(value.mostUsedModel), days }
}

type UsageStatsRangeDays = 7 | 30

/** Bridge to dsh-usage-stats's third-party HTTP endpoint; this is not a host RPC contract. */
function useUsageStats(days: number): UsageStatsSnapshot | undefined {
  const [state, setState] = useState<UsageStatsSnapshot>()
  useEffect(() => {
    let cancelled = false
    setState(undefined)
    const load = async (): Promise<void> => {
      if (typeof globalThis.fetch !== 'function') return
      try {
        const to = new Date()
        const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
        const params = new URLSearchParams({ from: isoDay(from), to: isoDay(to), scope: 'all', timeZone })
        const response = await globalThis.fetch(`/usage-stats/v1/snapshot?${params.toString()}`, {
          headers: { accept: 'application/json' },
        })
        if (!response.ok) return
        const payload: unknown = await response.json()
        const parsed = parseUsageStatsSnapshot(payload)
        if (!cancelled && parsed !== undefined) setState(parsed)
      } catch {
        // The optional third-party plugin may be absent from a host profile.
      }
    }
    void load()
    return () => { cancelled = true }
  }, [days])
  return state
}

function downloadUsageStats(state: UsageStatsSnapshot, format: 'csv' | 'json'): void {
  const content = format === 'json'
    ? JSON.stringify(state, null, 2)
    : ['date,tokens,calls', ...state.days.map(day => `${day.date},${day.tokens},${day.calls}`)].join('\n')
  const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `usage-stats.${format}`
  link.click()
  URL.revokeObjectURL(url)
}

function TokenCard({ useProjection }: { readonly useProjection: UseProjection }): ReactNode {
  const usage = useProjection('tokenUsage')
  const input = usage === undefined ? undefined : usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const total = input === undefined || usage === undefined ? undefined : input + usage.outputTokens
  const cacheHit = input === undefined || input === 0 || usage === undefined
    ? undefined
    : Math.min(100, Math.round(usage.cacheReadTokens / input * 100))
  const figures = [
    ['输入', input],
    ['输出', usage?.outputTokens],
    ['缓存读取', usage?.cacheReadTokens],
    ['总计', total],
  ] as const satisfies readonly (readonly [string, number | undefined])[]
  return (
    <StatCard title="当前会话 Tokens" label="当前会话">
      <div className={css.tokenFigures}>
        {figures.map(([label, value]) => {
          const displayValue = value === undefined ? '—' : formatTokens(value)
          return (
            <div key={label}>
              <b>{displayValue}</b>
              <span>{label}</span>
            </div>
          )
        })}
      </div>
      <div className={css.cacheRow}>
        <span>缓存命中率</span>
        <div className={css.cacheTrack}><i style={{ width: `${cacheHit ?? 0}%` }} /></div>
        <b>{cacheHit === undefined ? '—' : `${cacheHit}%`}</b>
      </div>
    </StatCard>
  )
}

function PlaceholderCard({ title, label, missing }: {
  readonly title: string
  readonly label: string
  readonly missing: string
}): ReactNode {
  return (
    <StatCard title={title} label={label}>
      <strong className={css.placeholderValue}>—</strong>
      <p className={css.muted}>{missing}</p>
    </StatCard>
  )
}

function TokenCompositionPanel({ useProjection }: { readonly useProjection: UseProjection }): ReactNode {
  const usage = useProjection('tokenUsage')
  const pressure = useProjection('contextPressure')
  const percent = contextOccupancy(pressure)?.percent
  const values = [
    ['输入', usage?.uncachedInputTokens],
    ['输出', usage?.outputTokens],
    ['缓存读取', usage?.cacheReadTokens],
    ['缓存写入', usage?.cacheWriteTokens],
  ] as const satisfies readonly (readonly [string, number | undefined])[]
  return (
    <section className={css.dataPanel}>
      <div className={css.panelHead}><h2>当前会话 Token 构成</h2><span className={css.panelNote}>NATIVE PROJECTION</span></div>
      <div className={css.compGrid}>
        {values.map(([label, value]) => {
          const displayValue = value === undefined ? '—' : formatTokens(value)
          return (
            <div className={css.compItem} key={label}>
              <span className={css.compLabel}>{label}</span>
              <b>{displayValue}</b>
            </div>
          )
        })}
      </div>
      <p className={css.muted}>{percent === undefined ? '等待 native contextPressure projection' : `上下文占用 ${percent}%`}</p>
    </section>
  )
}

/** Resolve the catalog entry the host currently reports as selected. */
function currentModelOf(state: MonitorDirectoryState): MonitorDirectoryState['groups'][number]['models'][number] | undefined {
  const { current } = state
  if (current === null) return undefined
  for (const group of state.groups) {
    if (group.id !== current.provider) continue
    for (const model of group.models) {
      if (model.id === current.model) return model
    }
  }
  return undefined
}

function EffortCardLive({ access }: { readonly access: MonitorEffortAccess }): ReactNode {
  const state = useSyncExternalStore(access.subscribe, access.getState)
  // The catalog is advisory and loaded on demand; both other entries do the
  // same on open, and the directory de-duplicates concurrent loads.
  useEffect(() => { access.load() }, [access])
  const model = currentModelOf(state)
  const reasoning = model?.reasoning
  const effective = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  if (state.error !== null) {
    return (
      <StatCard title="推理强度" label="MODEL SESSION">
        <strong className={css.placeholderValue}>—</strong>
        <p className={css.muted}>{state.error}</p>
      </StatCard>
    )
  }
  if (reasoning === undefined) {
    return (
      <StatCard title="推理强度" label="MODEL SESSION">
        <strong className={css.placeholderValue}>—</strong>
        <p className={css.muted}>
          {state.status === 'loading' || state.status === 'idle'
            ? '正在读取模型目录'
            : model === undefined ? '等待 native 模型选择' : `${model.name} 不支持推理强度`}
        </p>
      </StatCard>
    )
  }
  // Mirrors the composer seat: a provider-default row exists only when the
  // adapter reports one, and picking it clears the session's explicit effort.
  const choices: readonly (readonly [string, string | undefined, string])[] = [
    ...reasoning.defaultEffort === undefined
      ? []
      : [['provider-default', undefined, '提供商默认'] as const],
    ...reasoning.efforts.map(level => [`effort:${level.id}`, level.id, level.name] as const),
  ]
  return (
    <StatCard title="推理强度" label="MODEL SESSION">
      <div className={css.effortRow} role="radiogroup" aria-label="推理强度">
        {choices.map(([key, id, label]) => (
          <button
            aria-checked={effective === id}
            className={effective === id ? `${css.effortButton} ${css.effortSelected}` : css.effortButton}
            disabled={state.status === 'selecting'}
            key={key}
            onClick={() => { access.select(id) }}
            role="radio"
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <p className={css.muted}>{model === undefined ? '当前模型' : model.name}</p>
    </StatCard>
  )
}

function EffortCard({ effort }: { readonly effort: MonitorEffortAccess | undefined }): ReactNode {
  if (effort === undefined) {
    return (
      <PlaceholderCard
        title="推理强度"
        label="MODEL SESSION"
        missing="— 无活跃会话，或 ui-model-selection 未加载"
      />
    )
  }
  return <EffortCardLive access={effort} />
}

/**
 * Canonical trajectory summary. Reads the SAME `conversation.view` target the
 * Agent panel's 轨迹 tab renders, not a reconstruction: `views.get('trajectory')`
 * is ui-trajectory's own registered snapshot builder output.
 */
function TrajectoryPanel({ useConversation }: {
  readonly useConversation: MaybeSnapshotSelectorHook<ConversationSnapshot>
}): ReactNode {
  const snapshot = useConversation(session => session.views.get('trajectory'))
  if (snapshot === undefined) {
    return (
      <PlaceholderPanel
        title="运行轨迹"
        label="CONVERSATION.VIEW"
        missing="— 无活跃会话，或 trajectory view target 尚未装载"
      />
    )
  }
  let running = 0
  let failed = 0
  for (const request of snapshot.requests) {
    if (request.status === 'running') running += 1
    if (request.status === 'error') failed += 1
  }
  let latest = 0
  for (const node of snapshot.eventNodes) latest = Math.max(latest, node.time)
  const figures = [
    ['事件', snapshot.eventNodes.length],
    ['请求', snapshot.requests.length],
    ['进行中', running + snapshot.runningCalls.length],
    ['失败', failed],
  ] as const satisfies readonly (readonly [string, number])[]
  return (
    <section className={css.dataPanel}>
      <div className={css.panelHead}>
        <h2>运行轨迹</h2>
        <span className={css.panelNote}>CONVERSATION.VIEW</span>
      </div>
      <div className={css.compGrid}>
        {figures.map(([label, value]) => (
          <div className={css.compItem} key={label}>
            <span className={css.compLabel}>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <p className={css.muted}>
        {latest === 0
          ? '尚无轨迹事件'
          : `最近事件 ${new Date(latest).toLocaleTimeString()} · 完整三模式轨迹见 Agent 面板的「轨迹」标签`}
      </p>
    </section>
  )
}

function PlaceholderPanel({ title, label, missing, children }: {
  readonly title: string
  readonly label: string
  readonly missing: string
  readonly children?: ReactNode
}): ReactNode {
  return (
    <section aria-label={title} className={css.dataPanel}>
      <div className={css.panelHead}><h2>{title}</h2><span className={css.panelNote}>{label}</span></div>
      {children}
      <p className={css.placeholder}>{missing}</p>
    </section>
  )
}

/** One of the six usage-stats stat cards, sourced from the same `totals` the real 使用统计 page reads. */
function UsageStatsNumberCard({ title, value, note }: {
  readonly title: string
  readonly value: number | undefined
  readonly note: string
}): ReactNode {
  return (
    <StatCard title={title} label="USAGE STATS">
      <strong className={value === undefined ? css.placeholderValue : css.metricValue}>{value === undefined ? '—' : value}</strong>
      <p className={css.muted}>{value === undefined ? '— native usage-stats bridge unavailable' : note}</p>
    </StatCard>
  )
}

function UsageStatsTokensCard({ state }: { readonly state: UsageStatsSnapshot | undefined }): ReactNode {
  return (
    <StatCard title="Tokens 用量" label="USAGE STATS">
      <strong className={state === undefined ? css.placeholderValue : css.metricValue}>
        {state === undefined ? '—' : formatTokens(state.totals.tokens)}
      </strong>
      <p className={css.muted}>
        {state === undefined
          ? '— native usage-stats bridge unavailable'
          : `输入 ${formatTokens(state.totals.input)} · 输出 ${formatTokens(state.totals.output)}`}
      </p>
    </StatCard>
  )
}

function UsageStatsMostUsedModelCard({ model }: { readonly model: UsageStatsMostUsedModel | undefined }): ReactNode {
  return (
    <StatCard title="最常用模型" label="USAGE STATS">
      <strong className={model === undefined ? css.placeholderValue : `${css.metricValue} ${css.metricValueSmall}`}>
        {model === undefined ? '—' : model.model}
      </strong>
      <p className={css.muted}>
        {model === undefined ? '— native usage-stats bridge unavailable' : `${Math.round(model.percent * 10) / 10}% · ${model.provider}`}
      </p>
    </StatCard>
  )
}

function UsageStatsFilters({ rangeDays, onRangeChange, state }: {
  readonly rangeDays: UsageStatsRangeDays
  readonly onRangeChange: (days: UsageStatsRangeDays) => void
  readonly state: UsageStatsSnapshot | undefined
}): ReactNode {
  return (
    <>
      <div className={css.toolbar}>
        <span className={css.toolbarLabel}>趋势范围</span>
        <div className={css.range}>
          <button className={css.pill} data-active={rangeDays === 7} onClick={() => { onRangeChange(7) }} type="button">最近 7 天</button>
          <button className={css.pill} data-active={rangeDays === 30} onClick={() => { onRangeChange(30) }} type="button">最近 30 天</button>
        </div>
      </div>
      <div className={css.filters}>
        <div className={css.filtersLeft}>
          <button className={css.pill} disabled title="native 数据暂未按工作区拆分" type="button">全部工作区 ▾</button>
          <button className={css.pill} disabled title="native 数据暂未按任务拆分" type="button">全部任务 ▾</button>
        </div>
        <div className={css.filtersRight}>
          <button
            className={`${css.pill} ${css.pillExport}`}
            disabled={state === undefined}
            onClick={() => { if (state !== undefined) downloadUsageStats(state, 'csv') }}
            type="button"
          >
            ↓ CSV
          </button>
          <button
            className={`${css.pill} ${css.pillExport}`}
            disabled={state === undefined}
            onClick={() => { if (state !== undefined) downloadUsageStats(state, 'json') }}
            type="button"
          >
            ↓ JSON
          </button>
        </div>
      </div>
    </>
  )
}

const HOVER_CARD_WIDTH = 220

/** Clamps a hover card's left offset so it never overflows the panel's right edge. */
function clampHoverX(x: number, panelWidth: number): number {
  return Math.max(0, Math.min(x, panelWidth - HOVER_CARD_WIDTH))
}

/** Pointer position for a hover card, relative to `panel`'s own box and clamped off its right edge. Undefined before `panel` mounts. */
function hoverPositionFor(panel: HTMLElement | null, event: ReactMouseEvent): { readonly x: number; readonly y: number } | undefined {
  const rect = panel?.getBoundingClientRect()
  if (rect === undefined) return undefined
  return { x: clampHoverX(event.clientX - rect.left + 14, rect.width), y: event.clientY - rect.top + 14 }
}

/** A day hovered on the heatmap or the trend chart, with the pointer position its hover card renders at. */
interface ChartHoverPoint {
  readonly day: UsageStatsDay
  readonly x: number
  readonly y: number
}

interface HoverCardRow {
  readonly key: string
  readonly color?: string
  readonly label: string
  readonly value: string
}

/**
 * Shared hover card for the heatmap and the trend chart, replacing both
 * charts' native title/<title> tooltips with one styled, instant, pointer-
 * following card. Rendered inside a `position: relative` panel (`.dataPanel`
 * already is one) and never intercepts hover itself.
 */
function HoverCard({ x, y, title, rows }: {
  readonly x: number
  readonly y: number
  readonly title: string
  readonly rows: readonly HoverCardRow[]
}): ReactNode {
  return (
    <div className={css.hoverCard} style={{ left: x, top: y }}>
      <div className={css.hoverCardTitle}>{title}</div>
      {rows.map(row => (
        <div className={css.hoverCardRow} key={row.key}>
          {row.color !== undefined && <i className={css.hoverCardSwatch} style={{ background: row.color }} />}
          <span className={css.hoverCardLabel}>{row.label}</span>
          <b>{row.value}</b>
        </div>
      ))}
    </div>
  )
}

/** Hover rows for one heatmap day: totals plus the day's own busiest model, so a dark cell says what drove it. */
function heatmapHoverRows(day: UsageStatsDay): readonly HoverCardRow[] {
  const rows: HoverCardRow[] = [
    { key: 'tokens', label: 'Token', value: formatTokens(day.tokens) },
    { key: 'calls', label: '调用', value: String(day.calls) },
  ]
  let top: readonly [string, number] | undefined
  for (const entry of Object.entries(day.models)) if (top === undefined || entry[1] > top[1]) top = entry
  if (top !== undefined) rows.push({ key: 'top', label: modelLabel(top[0]), value: formatTokens(top[1]) })
  return rows
}

/**
 * The activity heatmap: always a fixed year window, independent of the
 * trend-range toggle above — matching the real 使用统计 page exactly.
 * Columns are proportional so any week count fits the panel with no
 * horizontal scroll.
 */
function UsageStatsHeatmap({ state }: { readonly state: UsageStatsSnapshot | undefined }): ReactNode {
  const panelRef = useRef<HTMLElement | null>(null)
  const [hover, setHover] = useState<ChartHoverPoint | undefined>(undefined)
  if (state === undefined) {
    return <PlaceholderPanel title="活跃热力图" label="ACTIVITY.HEATMAP" missing="— waiting for dsh-usage-stats snapshot" />
  }
  const maxTokens = Math.max(1, ...state.days.map(day => day.tokens))
  const levelClasses = [css.heatCell, css.heatLevel1, css.heatLevel2, css.heatLevel3, css.heatLevel4]
  const levelClass = (level: number): string => `${css.heatCell} ${levelClasses[level] ?? ''}`.trim()
  const weekCount = Math.max(1, Math.ceil(state.days.length / 7))
  const weeks = Array.from({ length: weekCount }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => state.days[w * 7 + d]))
  const showHover = (event: ReactMouseEvent<HTMLSpanElement>, day: UsageStatsDay): void => {
    const position = hoverPositionFor(panelRef.current, event)
    if (position !== undefined) setHover({ day, ...position })
  }
  return (
    <section className={css.dataPanel} ref={panelRef}>
      <div className={css.panelHead}>
        <h2>活跃热力图</h2>
        <div className={css.legend}>
          较少
          {[0, 1, 2, 3, 4].map(level => <i className={levelClass(level)} key={level} />)}
          较多
        </div>
      </div>
      <div className={css.heatBody}>
        <div className={css.heatDays}><span>一</span><span /><span>三</span><span /><span>五</span><span /><span /></div>
        <div className={css.weeks}>
          {weeks.map((week, w) => (
            <div className={css.week} key={w}>
              {week.map((day, d) => day === undefined
                ? <span className={css.heatCell} key={d} />
                : (() => {
                  const level = day.tokens === 0 ? 0 : Math.min(4, Math.ceil(day.tokens / maxTokens * 4))
                  return (
                    <span
                      className={levelClass(level)}
                      key={d}
                      onMouseEnter={(event) => { showHover(event, day) }}
                      onMouseLeave={() => { setHover(undefined) }}
                      onMouseMove={(event) => { showHover(event, day) }}
                    />
                  )
                })())}
            </div>
          ))}
        </div>
      </div>
      <p className={css.muted}>按 dsh-usage-stats days[].tokens；共 {state.days.length} 天</p>
      {hover !== undefined && (
        <HoverCard
          rows={heatmapHoverRows(hover.day)}
          title={hover.day.date}
          x={hover.x}
          y={hover.y}
        />
      )}
    </section>
  )
}

const MODEL_COLORS = [
  'var(--dsw-specific-agent-blue)',
  'var(--dsw-specific-agent-cyan)',
  'var(--dsw-specific-agent-pink)',
  'var(--dsw-specific-agent-yellow)',
  'var(--dsw-specific-agent-acid)',
]
const OTHER_COLOR = 'var(--dsw-specific-agent-muted)'
const OTHER_KEY = '__other__'

/** Short display label for a `provider/model` snapshot key: drop the provider prefix. */
function modelLabel(key: string): string {
  const slash = key.indexOf('/')
  return slash === -1 ? key : key.slice(slash + 1)
}

interface ChartSeries {
  readonly key: string
  readonly label: string
  readonly color: string
}

/** Ranks models by total tokens across `days`, capping at `capacity` distinct series and folding the rest into "其他". */
function topModelSeries(days: readonly UsageStatsDay[], capacity: number): readonly ChartSeries[] {
  const totals = new Map<string, number>()
  for (const day of days) {
    for (const [key, tokens] of Object.entries(day.models)) totals.set(key, (totals.get(key) ?? 0) + tokens)
  }
  const ranked = [...totals.entries()].sort(([, left], [, right]) => right - left)
  const series = ranked.slice(0, capacity).map(([key], index) => (
    { key, label: modelLabel(key), color: MODEL_COLORS[index] ?? OTHER_COLOR }
  ))
  if (ranked.length > capacity) series.push({ key: OTHER_KEY, label: '其他', color: OTHER_COLOR })
  return series
}

/** Non-zero hover rows for one day's stack, largest token count first. */
function hoverRowsForDay(
  day: UsageStatsDay,
  series: readonly ChartSeries[],
  valueFor: (day: UsageStatsDay, s: ChartSeries) => number,
): readonly HoverCardRow[] {
  return series
    .map(s => ({ key: s.key, color: s.color, label: s.label, tokens: valueFor(day, s) }))
    .filter(row => row.tokens > 0)
    .sort((left, right) => right.tokens - left.tokens)
    .map(row => ({ key: row.key, color: row.color, label: row.label, value: formatTokens(row.tokens) }))
}

/** Stacked daily Token trend, hand-rolled as an inline SVG bar chart (no charting library). */
function UsageStatsTrendChart({ state }: { readonly state: UsageStatsSnapshot | undefined }): ReactNode {
  const panelRef = useRef<HTMLElement | null>(null)
  const [hover, setHover] = useState<ChartHoverPoint | undefined>(undefined)
  if (state === undefined) {
    return <PlaceholderPanel title="按天 Token 趋势" label="USAGE.TREND" missing="— waiting for dsh-usage-stats snapshot" />
  }
  const { days } = state
  const series = topModelSeries(days, 5)
  const topKeys = new Set(series.filter(s => s.key !== OTHER_KEY).map(s => s.key))
  const valueFor = (day: UsageStatsDay, s: ChartSeries): number => {
    if (s.key !== OTHER_KEY) return day.models[s.key] ?? 0
    let sum = 0
    for (const [key, tokens] of Object.entries(day.models)) if (!topKeys.has(key)) sum += tokens
    return sum
  }
  const width = 1160
  const height = 220
  const plotHeight = height - 26
  const maxTotal = Math.max(1, ...days.map(day => day.tokens))
  const slot = days.length > 0 ? width / days.length : width
  const barWidth = Math.max(2, Math.min(28, slot * 0.62))
  const labelEvery = Math.max(1, Math.ceil(days.length / 8))
  const showHover = (event: ReactMouseEvent<SVGRectElement>, day: UsageStatsDay): void => {
    const position = hoverPositionFor(panelRef.current, event)
    if (position !== undefined) setHover({ day, ...position })
  }
  return (
    <section className={css.dataPanel} ref={panelRef}>
      <div className={css.panelHead}><h2>按天 Token 趋势</h2><span className={css.panelNote}>USAGE.TREND</span></div>
      <div className={css.chartWrap}>
        <svg className={css.chart} preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
          {[0, 1, 2, 3].map((line) => {
            const y = plotHeight * line / 3
            return <line key={line} stroke="rgb(255 255 255 / 8%)" strokeDasharray="3,4" x1={0} x2={width} y1={y} y2={y} />
          })}
          {days.map((day, i) => {
            const cx = slot * i + slot / 2
            let stackTop = plotHeight
            return (
              <g key={day.date}>
                {series.map((s) => {
                  const value = valueFor(day, s)
                  if (value <= 0) return null
                  const barHeight = plotHeight * value / maxTotal
                  const rectY = stackTop - barHeight
                  stackTop -= barHeight
                  return (
                    <rect
                      fill={s.color} height={Math.max(barHeight - 1, 0)} key={s.key}
                      width={barWidth} x={cx - barWidth / 2} y={rectY}
                    />
                  )
                })}
                {/* Transparent full-height hit area: hovering anywhere in the column reads the whole day, not one thin segment. */}
                <rect
                  className={css.hitArea}
                  height={plotHeight}
                  onMouseEnter={(event) => { showHover(event, day) }}
                  onMouseLeave={() => { setHover(undefined) }}
                  onMouseMove={(event) => { showHover(event, day) }}
                  width={slot}
                  x={cx - slot / 2}
                  y={0}
                />
                {i % labelEvery === 0 && (
                  <text fill="var(--dsw-specific-agent-muted)" fontSize={11} textAnchor="middle" x={cx} y={height - 8}>{day.date.slice(5)}</text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <div className={css.chartLegend}>
        {series.map(s => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <p className={css.muted}>按 dsh-usage-stats days[].models 的每日 token 堆叠；共 {days.length} 天</p>
      {hover !== undefined && (
        <HoverCard
          rows={hoverRowsForDay(hover.day, series, valueFor)}
          title={`${hover.day.date} · 共 ${formatTokens(hover.day.tokens)}`}
          x={hover.x}
          y={hover.y}
        />
      )}
    </section>
  )
}

/** SVG arc path for a donut ring segment, centered at (cx, cy) with radius r, from startAngle to endAngle degrees (0 = 12 o'clock). */
function donutArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const point = (angle: number): readonly [number, number] => {
    const radians = (angle - 90) * Math.PI / 180
    return [cx + r * Math.cos(radians), cy + r * Math.sin(radians)]
  }
  const [x0, y0] = point(startAngle)
  const [x1, y1] = point(endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`
}

/** Model usage: a donut of token share plus a ranked list, both from the SAME window aggregate. */
function UsageStatsModelUsagePanel({ state }: { readonly state: UsageStatsSnapshot | undefined }): ReactNode {
  if (state === undefined) {
    return <PlaceholderPanel title="模型用量" label="MODEL.USAGE" missing="— waiting for dsh-usage-stats snapshot" />
  }
  const totalsByModel = new Map<string, number>()
  for (const day of state.days) {
    for (const [key, tokens] of Object.entries(day.models)) totalsByModel.set(key, (totalsByModel.get(key) ?? 0) + tokens)
  }
  const totalTokens = [...totalsByModel.values()].reduce((sum, tokens) => sum + tokens, 0)
  const ranked = [...totalsByModel.entries()].sort(([, left], [, right]) => right - left)
  const capacity = 5
  const otherTokens = ranked.slice(capacity).reduce((sum, [, tokens]) => sum + tokens, 0)
  const rows = [
    ...ranked.slice(0, capacity).map(([key, tokens], index) => ({
      key, tokens, color: MODEL_COLORS[index] ?? OTHER_COLOR, percent: totalTokens > 0 ? tokens / totalTokens * 100 : 0,
    })),
    ...ranked.length > capacity
      ? [{ key: OTHER_KEY, tokens: otherTokens, color: OTHER_COLOR, percent: totalTokens > 0 ? otherTokens / totalTokens * 100 : 0 }]
      : [],
  ]
  let angle = 0
  const arcs = rows.filter(row => row.percent > 0).map((row) => {
    const sweep = Math.min(row.percent / 100 * 360, 359.5)
    const path = donutArcPath(84, 84, 66, angle, angle + Math.max(sweep - 1.5, 0))
    angle += sweep
    return { key: row.key, path, color: row.color }
  })
  return (
    <section className={css.dataPanel}>
      <div className={css.panelHead}><h2>模型用量</h2><span className={css.panelNote}>MODEL.USAGE</span></div>
      {rows.length === 0 ? <p className={css.placeholder}>暂无模型调用</p> : (
        <div className={css.modelBody}>
          <div className={css.donutWrap}>
            <svg height={168} viewBox="0 0 168 168" width={168}>
              {arcs.map(arc => <path d={arc.path} fill="none" key={arc.key} stroke={arc.color} strokeWidth={22} />)}
            </svg>
            <div className={css.donutCenter}><b>{formatTokens(totalTokens)}</b><span>tokens</span></div>
          </div>
          <div className={css.modelList}>
            {rows.map((row) => {
              const isOther = row.key === OTHER_KEY
              return (
                <div className={css.modelRow} key={row.key}>
                  <div className={css.modelInfo}>
                    <div className={css.modelName}><i style={{ background: row.color }} />{isOther ? '其他模型' : modelLabel(row.key)}</div>
                    {!isOther && <div className={css.modelDetail}>{row.key.slice(0, row.key.indexOf('/'))} · {formatTokens(row.tokens)} tokens</div>}
                  </div>
                  <div className={css.modelPct}>{Math.round(row.percent * 10) / 10}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      <p className={css.muted}>按 days[].models 的 token 汇总占比（近 {state.days.length} 天）</p>
    </section>
  )
}

/** Windowed input/output/cache-read/cache-write breakdown from `totals` — the same aggregate window the stat cards above use. */
function UsageStatsTokenComposition({ state }: { readonly state: UsageStatsSnapshot | undefined }): ReactNode {
  if (state === undefined) {
    return <PlaceholderPanel title="Token 构成" label="TOKEN.COMPOSITION" missing="— waiting for dsh-usage-stats snapshot" />
  }
  const values = [
    ['输入', state.totals.input],
    ['输出', state.totals.output],
    ['缓存读取', state.totals.cacheRead],
    ['缓存写入', state.totals.cacheWrite],
  ] as const satisfies readonly (readonly [string, number])[]
  return (
    <section className={css.dataPanel}>
      <div className={css.panelHead}><h2>Token 构成</h2><span className={css.panelNote}>TOKEN.COMPOSITION</span></div>
      <div className={css.compGrid}>
        {values.map(([label, value]) => (
          <div className={css.compItem} key={label}>
            <span className={css.compLabel}>{label}</span>
            <b>{formatTokens(value)}</b>
          </div>
        ))}
      </div>
      <p className={css.muted}>按 dsh-usage-stats totals 的窗口内汇总（近 {state.days.length} 天）</p>
    </section>
  )
}

interface UsageStatsCallTokens {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

interface UsageStatsCall {
  readonly key: string
  readonly time: number
  readonly provider: string
  readonly model: string
  readonly effort: string | undefined
  readonly durationMs: number
  readonly tokens: UsageStatsCallTokens
}

interface UsageStatsCallsPage {
  readonly items: readonly UsageStatsCall[]
  readonly page: number
  readonly pageSize: number
  readonly total: number
  readonly hasMore: boolean
}

function usageStatsCallTokens(value: unknown): UsageStatsCallTokens | undefined {
  if (!isRecord(value)) return undefined
  const input = numberField(value, 'input')
  const output = numberField(value, 'output')
  if (input === undefined || output === undefined) return undefined
  return { input, output, cacheRead: numberField(value, 'cacheRead') ?? 0, cacheWrite: numberField(value, 'cacheWrite') ?? 0 }
}

function usageStatsCall(value: unknown): UsageStatsCall | undefined {
  if (!isRecord(value)) return undefined
  const { key, provider, model } = value
  const time = numberField(value, 'time')
  const durationMs = numberField(value, 'durationMs')
  const tokens = usageStatsCallTokens(value.tokens)
  if (typeof key !== 'string' || time === undefined || typeof provider !== 'string' || typeof model !== 'string'
    || durationMs === undefined || tokens === undefined) return undefined
  return { key, time, provider, model, effort: typeof value.effort === 'string' ? value.effort : undefined, durationMs, tokens }
}

/** Parses `dsh-usage-stats`'s paginated `/usage-stats/v1/calls` response — real per-call detail, not a client-side reconstruction. */
function parseUsageStatsCallsPage(value: unknown): UsageStatsCallsPage | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined
  const page = numberField(value, 'page')
  const pageSize = numberField(value, 'pageSize')
  const total = numberField(value, 'total')
  if (page === undefined || pageSize === undefined || total === undefined) return undefined
  return {
    items: value.items.map(usageStatsCall).filter((call): call is UsageStatsCall => call !== undefined),
    page,
    pageSize,
    total,
    hasMore: value.hasMore === true,
  }
}

const CALLS_PAGE_SIZE = 20

/**
 * Server-side query for `/usage-stats/v1/calls`. Model, provider and token-floor
 * filtering happen on the endpoint, not the loaded page, so totals and `hasMore` stay correct.
 */
interface UsageStatsCallsQuery {
  readonly model: string
  readonly provider: string
  readonly minInputTokens: string
  readonly minOutputTokens: string
  readonly maxRecords: number
  readonly pageSize: number
}

function useUsageStatsCalls(days: number, page: number, query: UsageStatsCallsQuery): UsageStatsCallsPage | undefined {
  const [state, setState] = useState<UsageStatsCallsPage>()
  useEffect(() => {
    let cancelled = false
    // Keep showing the previous page while a filter/pagination change refetches, rather than
    // flashing back to the placeholder and disabling the toolbar mid-edit.
    const load = async (): Promise<void> => {
      if (typeof globalThis.fetch !== 'function') return
      try {
        const to = new Date()
        const from = new Date(to.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
        const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
        const params = new URLSearchParams({
          from: isoDay(from), to: isoDay(to), scope: 'all', timeZone,
          page: String(page), pageSize: String(query.pageSize), maxRecords: String(query.maxRecords),
        })
        if (query.model !== '') params.set('model', query.model)
        if (query.provider !== '') params.set('provider', query.provider)
        if (query.minInputTokens !== '') params.set('minInputTokens', query.minInputTokens)
        if (query.minOutputTokens !== '') params.set('minOutputTokens', query.minOutputTokens)
        const response = await globalThis.fetch(`/usage-stats/v1/calls?${params.toString()}`, { headers: { accept: 'application/json' } })
        if (!response.ok) return
        const payload: unknown = await response.json()
        const parsed = parseUsageStatsCallsPage(payload)
        if (!cancelled && parsed !== undefined) setState(parsed)
      } catch {
        // The optional third-party plugin may be absent from a host profile.
      }
    }
    void load()
    return () => { cancelled = true }
  }, [days, page, query.model, query.provider, query.minInputTokens, query.minOutputTokens, query.maxRecords, query.pageSize])
  return state
}

interface CallFilterOptions {
  readonly models: readonly string[]
  readonly providers: readonly string[]
}

/** Distinct model/provider names across the whole windowed snapshot, not just the loaded page. */
function callFilterOptions(state: UsageStatsSnapshot | undefined): CallFilterOptions {
  if (state === undefined) return { models: [], providers: [] }
  const models = new Set<string>()
  const providers = new Set<string>()
  for (const day of state.days) {
    for (const key of Object.keys(day.models)) {
      const slash = key.indexOf('/')
      if (slash === -1) { models.add(key); continue }
      providers.add(key.slice(0, slash))
      models.add(key.slice(slash + 1))
    }
  }
  return { models: [...models].sort(), providers: [...providers].sort() }
}

function formatCallDuration(ms: number): string {
  return `${Math.round(ms / 100) / 10}s`
}

function formatCallTime(epochMs: number): string {
  const date = new Date(epochMs)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const EFFORT_LABEL: Readonly<Record<string, string>> = { low: '低', medium: '中', high: '高' }

/**
 * Per-call detail table, real and paginated through `/usage-stats/v1/calls`.
 * Model/provider/token-floor filters and the max-records/page-size controls
 * are all sent as query params to the SAME endpoint, the original 使用统计
 * page's approach, rather than filtered client-side against the loaded
 * page, which would report a wrong total and `hasMore` for anything outside
 * that one page.
 */
function CallDetailsPanel({ rangeDays, usageStats }: {
  readonly rangeDays: UsageStatsRangeDays
  readonly usageStats: UsageStatsSnapshot | undefined
}): ReactNode {
  const [page, setPage] = useState(1)
  const [modelFilter, setModelFilter] = useState('')
  const [providerFilter, setProviderFilter] = useState('')
  const [minInputTokens, setMinInputTokens] = useState('')
  const [minOutputTokens, setMinOutputTokens] = useState('')
  const [maxRecords, setMaxRecords] = useState<number>(1000)
  const [pageSize, setPageSize] = useState<number>(CALLS_PAGE_SIZE)
  useEffect(() => {
    setPage(1)
  }, [rangeDays, modelFilter, providerFilter, minInputTokens, minOutputTokens, maxRecords, pageSize])
  const data = useUsageStatsCalls(rangeDays, page, {
    model: modelFilter, provider: providerFilter, minInputTokens, minOutputTokens, maxRecords, pageSize,
  })
  const { models, providers } = callFilterOptions(usageStats)
  const hasFilters = modelFilter !== '' || providerFilter !== '' || minInputTokens !== '' || minOutputTokens !== ''
  const clearFilters = (): void => {
    setModelFilter('')
    setProviderFilter('')
    setMinInputTokens('')
    setMinOutputTokens('')
  }
  const toolbar = (
    <div className={css.tableToolbar}>
      <select aria-label="按模型筛选" disabled={data === undefined} onChange={(event) => { setModelFilter(event.currentTarget.value) }} value={modelFilter}>
        <option value="">全部模型</option>
        {models.map(model => <option key={model} value={model}>{model}</option>)}
      </select>
      <select aria-label="按提供商筛选" disabled={data === undefined} onChange={(event) => { setProviderFilter(event.currentTarget.value) }} value={providerFilter}>
        <option value="">全部提供商</option>
        {providers.map(provider => <option key={provider} value={provider}>{provider}</option>)}
      </select>
      <input
        aria-label="输入 Token 下限"
        disabled={data === undefined}
        min={0}
        onChange={(event) => { setMinInputTokens(event.currentTarget.value) }}
        placeholder="输入 ≥ Token"
        type="number"
        value={minInputTokens}
      />
      <input
        aria-label="输出 Token 下限"
        disabled={data === undefined}
        min={0}
        onChange={(event) => { setMinOutputTokens(event.currentTarget.value) }}
        placeholder="输出 ≥ Token"
        type="number"
        value={minOutputTokens}
      />
      <button aria-label="清除筛选" className={css.clearFilters} disabled={!hasFilters} onClick={clearFilters} type="button">✕ 清除筛选</button>
      <span className={css.spacer} />
      <label className={css.toolbarNumber}>
        明细上限
        <input
          aria-label="明细上限"
          disabled={data === undefined}
          min={1}
          onChange={(event) => { const n = Number(event.currentTarget.value); if (n > 0) setMaxRecords(n) }}
          type="number"
          value={maxRecords}
        />
        条
      </label>
      <label className={css.toolbarNumber}>
        <input
          aria-label="每页条数"
          disabled={data === undefined}
          min={1}
          onChange={(event) => { const n = Number(event.currentTarget.value); if (n > 0) setPageSize(n) }}
          type="number"
          value={pageSize}
        />
        条/页
      </label>
    </div>
  )
  if (data === undefined) {
    return (
      <PlaceholderPanel label="CALL.DETAILS" missing="— waiting for dsh-usage-stats snapshot" title="调用明细">
        {toolbar}
      </PlaceholderPanel>
    )
  }
  const start = data.total === 0 ? 0 : (data.page - 1) * data.pageSize + 1
  const end = Math.min(data.page * data.pageSize, data.total)
  return (
    <section aria-label="调用明细" className={css.dataPanel}>
      <div className={css.panelHead}><h2>调用明细</h2><span className={css.panelNote}>每次模型调用 · 最新在前</span></div>
      {toolbar}
      {data.items.length === 0 ? <p className={css.placeholder}>没有匹配的调用</p> : (
        <div className={css.tableWrap}>
          <table>
            <thead><tr><th>时间</th><th>响应耗时</th><th>输入</th><th>输出</th><th>缓存率</th><th>模型</th><th>思考程度</th></tr></thead>
            <tbody>
              {data.items.map((call) => {
                const cacheBasis = call.tokens.input + call.tokens.cacheRead
                const cacheRate = cacheBasis > 0 ? Math.round(call.tokens.cacheRead / cacheBasis * 100) : 0
                return (
                  <tr key={call.key}>
                    <td>{formatCallTime(call.time)}</td>
                    <td>{formatCallDuration(call.durationMs)}</td>
                    <td>{formatTokens(call.tokens.input)}</td>
                    <td>{formatTokens(call.tokens.output)}</td>
                    <td>{cacheRate}%</td>
                    <td>{call.model}</td>
                    <td>{call.effort === undefined ? '默认' : EFFORT_LABEL[call.effort] ?? call.effort}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className={css.tfoot}>
        <span>{data.total === 0 ? '0 条' : `${start}-${end} / 共 ${data.total} 条`}</span>
        <button aria-label="上一页" disabled={data.page <= 1} onClick={() => { setPage(p => Math.max(1, p - 1)) }} type="button">‹</button>
        <button aria-label="下一页" disabled={!data.hasMore} onClick={() => { setPage(p => p + 1) }} type="button">›</button>
      </div>
    </section>
  )
}

/** The activity heatmap is always a full year, so it is fetched on its own, independent of the trend-range toggle. */
const HEATMAP_WINDOW_DAYS = 365

export function MonitorPanel({ appPanels, useProjection, useConversation, effort }: MonitorPanelProps): ReactNode {
  const activePanel = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [rangeDays, setRangeDays] = useState<UsageStatsRangeDays>(30)
  const usageStats = useUsageStats(rangeDays)
  const heatmapStats = useUsageStats(HEATMAP_WINDOW_DAYS)
  return (
    <section className={css.root} data-monitor-panel hidden={activePanel !== 'monitor'} aria-label="Monitor / 监控">
      <header className={css.header}>
        <div className={css.titleLockup}>
          <span className={css.titleMark}>05</span>
          <div><strong>Monitor</strong><small>用量与轨迹</small></div>
        </div>
        <span className={css.readOnly}>UI SHELL / NATIVE DATA NEXT</span>
      </header>
      <main className={css.content}>
        <section className={css.hero}>
          <div>
            <p className={css.kicker}>USAGE / TRAJECTORY / EFFORT</p>
            <h1>看得见每一次<br /><span>思考的成本。</span></h1>
            <p>Token 用量、缓存命中、运行轨迹与推理强度，统一收进一个工作台。</p>
          </div>
          <button type="button" disabled className={css.refresh}>↻ 刷新</button>
        </section>

        <UsageStatsFilters onRangeChange={setRangeDays} rangeDays={rangeDays} state={usageStats} />
        <div className={css.grid}>
          <UsageStatsTokensCard state={usageStats} />
          <UsageStatsNumberCard note="来自 dsh-usage-stats totals.sessions" title="会话数量" value={usageStats?.totals.sessions} />
          <UsageStatsNumberCard note="来自 dsh-usage-stats totals.messages" title="消息数量" value={usageStats?.totals.messages} />
          <UsageStatsNumberCard note={`近 ${rangeDays} 天窗口内`} title="活跃天数" value={usageStats?.totals.activeDays} />
          <UsageStatsNumberCard note="截至今日" title="当前连续天数" value={usageStats?.totals.currentStreak} />
          <UsageStatsMostUsedModelCard model={usageStats?.mostUsedModel} />
        </div>
        <UsageStatsHeatmap state={heatmapStats} />
        <UsageStatsTrendChart state={usageStats} />
        <UsageStatsModelUsagePanel state={usageStats} />
        <UsageStatsTokenComposition state={usageStats} />
        <CallDetailsPanel rangeDays={rangeDays} usageStats={usageStats} />

        <h2 className={`${css.sectionLabel} ${css.sectionLabelMuted}`}>原生扩展 · 超出 usage-stats 范围（已实现，非本轮改动）</h2>
        <div className={css.grid}>
          <TokenCard useProjection={useProjection} />
          <EffortCard effort={effort} />
        </div>
        <TrajectoryPanel useConversation={useConversation} />
        <TokenCompositionPanel useProjection={useProjection} />
      </main>
    </section>
  )
}
