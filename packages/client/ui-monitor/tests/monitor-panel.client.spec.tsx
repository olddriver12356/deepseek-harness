// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import {
  MonitorPanel,
  type MonitorDirectoryState,
  type MonitorEffortAccess,
  type MonitorPanelProps,
} from '../src/client/MonitorPanel.tsx'
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client'

afterEach(cleanup)

function renderMonitor(options: {
  readonly projection?: Record<string, unknown>
  readonly snapshot?: ConversationSnapshot
  readonly effort?: MonitorEffortAccess
} = {}) {
  const appPanels = new AppPanelsController()
  act(() => { appPanels.setActive('monitor') })
  const snapshot = options.snapshot
  const projection: Readonly<Record<string, unknown>> = options.projection ?? {}
  const props: MonitorPanelProps = {
    appPanels,
    useProjection: (key: string) => projection[key],
    useSession: selector => snapshot === undefined ? undefined : selector(snapshot),
    effort: options.effort,
  }
  return render(<MonitorPanel {...props} />)
}

/** A session snapshot exposing only the canonical trajectory view target. */
function snapshotWithTrajectory(trajectory: unknown): ConversationSnapshot {
  return {
    views: { get: (target: string) => target === 'trajectory' ? trajectory : undefined },
  } as unknown as ConversationSnapshot
}

/** A stub over the shared ModelDirectory, matching the real store's contract. */
function effortAccess(state: MonitorDirectoryState, selected: (id: string | undefined) => void = () => {}): MonitorEffortAccess {
  return {
    subscribe: () => () => {},
    getState: () => state,
    load: () => {},
    select: selected,
  }
}

const REASONING_STATE: MonitorDirectoryState = {
  current: { provider: 'deepseek', model: 'reasoner' },
  groups: [{
    id: 'deepseek',
    models: [{
      id: 'reasoner',
      name: 'DeepSeek Reasoner',
      reasoning: { defaultEffort: 'medium', efforts: [{ id: 'low', name: '低' }, { id: 'medium', name: '中' }, { id: 'high', name: '高' }] },
    }],
  }],
  status: 'ready',
  error: null,
}

interface UsageStatsFixtureDay {
  readonly date: string
  readonly tokens: number
  readonly calls: number
  readonly messages: number
  readonly sessions: number
  readonly models: Readonly<Record<string, number>>
}

const TWO_DAYS: readonly UsageStatsFixtureDay[] = [
  { date: '2026-09-03', tokens: 400, calls: 4, messages: 4, sessions: 1, models: { 'deepseek-modlens/deepseek-reasoner': 240, 'deepseek-official/deepseek-chat': 160 } },
  { date: '2026-09-04', tokens: 600, calls: 6, messages: 6, sessions: 2, models: { 'deepseek-modlens/deepseek-reasoner': 360, 'deepseek-official/deepseek-chat': 240 } },
]

const ONE_CALL_PAGE = {
  items: [
    {
      key: 'session-a:1', seq: 1, time: 1_788_584_287_935, sessionId: 'session-a', provider: 'deepseek-modlens',
      model: 'deepseek-reasoner', effort: 'high', durationMs: 3_900,
      tokens: { input: 100, output: 50, cacheRead: 900, cacheWrite: 0, reasoning: 40 },
    },
  ],
  page: 1, pageSize: 20, total: 1, hasMore: false,
}

/** A fetch stub that answers both the usage-stats snapshot and calls endpoints, and records every URL it was called with. */
function fetchStub(days: readonly UsageStatsFixtureDay[], callsPage: unknown = ONE_CALL_PAGE) {
  const calls: string[] = []
  const mock = vi.fn(async (input: unknown) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/usage-stats/v1/calls')) return Response.json(callsPage)
    return Response.json({
      generatedAt: 1_788_577_622_653,
      range: { from: '2026-08-06', to: '2026-09-04', timeZone: 'UTC' },
      totals: {
        tokens: 1_000, input: 700, output: 300, cacheRead: 900, cacheWrite: 0, sessions: 3, messages: 10, activeDays: 2, currentStreak: 1,
      },
      mostUsedModel: { key: 'deepseek-modlens/deepseek-reasoner', provider: 'deepseek-modlens', model: 'deepseek-reasoner', tokens: 600, calls: 6, percent: 60 },
      days,
    })
  })
  return { mock, calls }
}

describe('MonitorPanel', () => {
  it('renders the usage surface with honest native wiring placeholders', () => {
    renderMonitor()

    expect(screen.getByRole('region', { name: 'Monitor / 监控' })).toBeTruthy()
    expect(screen.getByText('USAGE / TRAJECTORY / EFFORT')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '活跃热力图' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '按天 Token 趋势' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '模型用量' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Token 构成' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '调用明细' })).toBeTruthy()
    expect(screen.getByText('等待 native contextPressure projection')).toBeTruthy()
    expect(screen.getAllByText('— native usage-stats bridge unavailable').length).toBeGreaterThan(0)
    expect(screen.getAllByText('— waiting for dsh-usage-stats snapshot').length).toBeGreaterThan(0)
  })

  it('renders context projection data when native values exist', () => {
    renderMonitor({
      projection: {
        tokenUsage: { uncachedInputTokens: 1_000, outputTokens: 500, cacheReadTokens: 2_000, cacheWriteTokens: 100 },
        contextPressure: { projectedTokens: 64_000, contextWindow: 128_000 },
      },
    })

    expect(screen.getByText('3.1K')).toBeTruthy()
    expect(screen.getByText('上下文占用 50%')).toBeTruthy()
  })

  it('bridges all six usage-stats cards, the trend chart, the model donut and token composition through the real snapshot endpoint', async () => {
    const originalFetch = globalThis.fetch
    const { mock, calls } = fetchStub(TWO_DAYS)
    globalThis.fetch = mock
    try {
      renderMonitor()
      await act(async () => {})

      // Three independent fetches: the trend-range snapshot, the fixed 365-day heatmap snapshot, and the calls page.
      expect(calls.some(url => url.includes('/usage-stats/v1/snapshot?') && url.includes('scope=all'))).toBe(true)
      expect(calls.some(url => url.includes('/usage-stats/v1/calls?'))).toBe(true)
      expect(calls.length).toBe(3)

      const metric = (title: string): HTMLElement => screen.getByRole('heading', { name: title }).closest('article') as HTMLElement
      expect(within(metric('Tokens 用量')).getByText('1K')).toBeTruthy()
      expect(within(metric('会话数量')).getByText('3')).toBeTruthy()
      expect(within(metric('消息数量')).getByText('10')).toBeTruthy()
      expect(within(metric('活跃天数')).getByText('2')).toBeTruthy()
      expect(within(metric('当前连续天数')).getByText('1')).toBeTruthy()
      expect(within(metric('最常用模型')).getByText('deepseek-reasoner')).toBeTruthy()
      expect(screen.getByText('60% · deepseek-modlens')).toBeTruthy()

      expect(screen.getByText('按 dsh-usage-stats days[].tokens；共 2 天')).toBeTruthy()
      expect(screen.getByText(/按 dsh-usage-stats days\[\]\.models 的每日 token 堆叠；共 2 天/)).toBeTruthy()
      expect(screen.getByText(/按 days\[\]\.models 的 token 汇总占比/)).toBeTruthy()
      const modelUsageSection = screen.getByRole('heading', { name: '模型用量' }).closest('section') as HTMLElement
      expect(within(modelUsageSection).getByText(formatTokensLike(1_000))).toBeTruthy()
      expect(screen.getByText(/按 dsh-usage-stats totals 的窗口内汇总/)).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('re-fetches only the trend-range and calls windows when the 7/30-day toggle is used, leaving the heatmap window untouched', async () => {
    const originalFetch = globalThis.fetch
    const { mock, calls } = fetchStub(TWO_DAYS)
    globalThis.fetch = mock
    try {
      renderMonitor()
      await act(async () => {})
      calls.length = 0

      act(() => { screen.getByRole('button', { name: '最近 7 天' }).click() })
      await act(async () => {})

      const spanOf = (url: string): number => {
        const from = new URL(url, 'http://localhost').searchParams.get('from')
        const to = new URL(url, 'http://localhost').searchParams.get('to')
        return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1
      }
      const snapshotCalls = calls.filter(url => url.includes('/usage-stats/v1/snapshot?'))
      expect(snapshotCalls.length).toBe(1)
      expect(spanOf(snapshotCalls[0]!)).toBe(7)
      const callsCalls = calls.filter(url => url.includes('/usage-stats/v1/calls?'))
      expect(callsCalls.length).toBe(1)
      expect(spanOf(callsCalls[0]!)).toBe(7)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('fetches a fixed 365-day window for the heatmap, independent of the trend-range toggle', async () => {
    const originalFetch = globalThis.fetch
    const { mock, calls } = fetchStub(TWO_DAYS)
    globalThis.fetch = mock
    try {
      renderMonitor()
      await act(async () => {})

      const heatmapUrl = calls.find((url) => {
        if (!url.includes('/usage-stats/v1/snapshot?')) return false
        const from = new URL(url, 'http://localhost').searchParams.get('from')
        const to = new URL(url, 'http://localhost').searchParams.get('to')
        const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1
        return days === 365
      })
      expect(heatmapUrl).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('renders real per-call rows and pages through them via the actual endpoint', async () => {
    const originalFetch = globalThis.fetch
    const page1 = {
      items: [
        { key: 'a:1', time: 1_788_584_287_935, provider: 'codex', model: 'gpt-5.6-luna', effort: 'medium', durationMs: 3_900, tokens: { input: 1_500, output: 400, cacheRead: 500, cacheWrite: 0 } },
      ],
      page: 1, pageSize: 20, total: 21, hasMore: true,
    }
    const { mock, calls } = fetchStub(TWO_DAYS, page1)
    globalThis.fetch = mock
    try {
      renderMonitor()
      await act(async () => {})

      const table = screen.getByRole('heading', { name: '调用明细' }).closest('section') as HTMLElement
      const row = within(table).getByText('3.9s').closest('tr') as HTMLElement
      expect(within(row).getByText('gpt-5.6-luna')).toBeTruthy()
      expect(within(row).getByText('中')).toBeTruthy()
      expect(within(table).getByText('1-20 / 共 21 条')).toBeTruthy()
      expect(within(table).getByRole('button', { name: '‹' }).hasAttribute('disabled')).toBe(true)
      expect(within(table).getByRole('button', { name: '›' }).hasAttribute('disabled')).toBe(false)

      calls.length = 0
      act(() => { within(table).getByRole('button', { name: '›' }).click() })
      await act(async () => {})
      const nextPageCall = calls.find(url => url.includes('/usage-stats/v1/calls?') && url.includes('page=2'))
      expect(nextPageCall).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('exports the currently loaded usage-stats snapshot as CSV or JSON', async () => {
    const originalFetch = globalThis.fetch
    const { mock } = fetchStub(TWO_DAYS)
    globalThis.fetch = mock
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    try {
      renderMonitor()
      await act(async () => {})

      const csvButton = screen.getByRole('button', { name: '↓ CSV' })
      const jsonButton = screen.getByRole('button', { name: '↓ JSON' })
      expect(csvButton.hasAttribute('disabled')).toBe(false)
      act(() => { csvButton.click() })
      act(() => { jsonButton.click() })
      expect(createObjectURL).toHaveBeenCalledTimes(2)
    } finally {
      globalThis.fetch = originalFetch
      createObjectURL.mockRestore()
      revokeObjectURL.mockRestore()
    }
  })

  it('stays mounted and hidden while another application panel is active', () => {
    const appPanels = new AppPanelsController()
    const view = render(
      <MonitorPanel
        appPanels={appPanels}
        useProjection={() => undefined}
        useSession={() => undefined}
      />,
    )
    const panel = view.container.querySelector('[data-monitor-panel]') as HTMLElement

    expect(panel.hidden).toBe(true)
    act(() => { appPanels.setActive('monitor') })
    expect(panel.hidden).toBe(false)
  })

  it('offers the reasoning levels the host reports, marking the effective one', () => {
    renderMonitor({ effort: effortAccess(REASONING_STATE) })

    expect(screen.getByRole('radiogroup', { name: '推理强度' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '提供商默认' })).toBeTruthy()
    // No explicit session effort, so the model's own default is effective.
    expect(screen.getByRole('radio', { name: '中' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: '低' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByText('DeepSeek Reasoner')).toBeTruthy()
  })

  it('submits the picked effort through the shared directory', () => {
    const picked: (string | undefined)[] = []
    renderMonitor({ effort: effortAccess(REASONING_STATE, id => picked.push(id)) })

    act(() => { screen.getByRole('radio', { name: '高' }).click() })
    act(() => { screen.getByRole('radio', { name: '提供商默认' }).click() })

    expect(picked).toEqual(['high', undefined])
  })

  it('states plainly when the selected model carries no reasoning levels', () => {
    renderMonitor({
      effort: effortAccess({
        current: { provider: 'deepseek', model: 'chat' },
        groups: [{ id: 'deepseek', models: [{ id: 'chat', name: 'DeepSeek Chat' }] }],
        status: 'ready',
        error: null,
      }),
    })

    expect(screen.getByText('DeepSeek Chat 不支持推理强度')).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: '推理强度' })).toBeNull()
  })

  it('falls back to an honest placeholder with no session or model service', () => {
    renderMonitor()

    expect(screen.getByText('— 无活跃会话，或 ui-model-selection 未加载')).toBeTruthy()
  })

  it('summarizes the canonical conversation.view trajectory target', () => {
    renderMonitor({
      snapshot: snapshotWithTrajectory({
        eventNodes: [{ time: 1_700_000_000_000 }, { time: 1_700_000_060_000 }],
        requests: [{ status: 'complete' }, { status: 'running' }, { status: 'error' }],
        runningCalls: [{}],
      }),
    })

    const section = screen.getByRole('heading', { name: '运行轨迹' }).closest('section') as HTMLElement
    const figure = (label: string): string | undefined =>
      within(section).getByText(label).parentElement?.querySelector('b')?.textContent ?? undefined

    expect(screen.getByText('CONVERSATION.VIEW')).toBeTruthy()
    expect(figure('事件')).toBe('2')
    expect(figure('请求')).toBe('3')
    // One running request plus one in-flight tool call.
    expect(figure('进行中')).toBe('2')
    expect(figure('失败')).toBe('1')
  })

  it('does not invent a trajectory when no session view target is loaded', () => {
    renderMonitor()

    expect(screen.getByText('— 无活跃会话，或 trajectory view target 尚未装载')).toBeTruthy()
  })
})

/** Mirrors MonitorPanel's own formatTokens for assertions, so the test doesn't hardcode a duplicate constant that can drift. */
function formatTokensLike(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${Math.round(value / 100) / 10}K`
  return `${Math.round(value / 100_000) / 10}M`
}
