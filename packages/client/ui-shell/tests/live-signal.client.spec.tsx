// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveSignalPanel } from '@deepseek-ai/dsh-client-ui-shell/src/client/LiveSignalPanel.tsx'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'

afterEach(cleanup)

interface MountOptions {
  goal?: unknown
  pressure?: unknown
  breakdown?: unknown
  usage?: unknown
  trajectory?: unknown
  pending?: Pick<SessionPendingInteraction, 'key' | 'kind' | 'sessionId'>
  running?: boolean
  verbs?: Partial<Record<'onEditGoal' | 'onPauseGoal' | 'onResumeGoal' | 'onClearGoal', unknown>>
}

/** A goal projection with the phase under test; the rest of the shape stays at its ordinary values. */
function goalAt(phase: string, extra: Record<string, unknown> = {}) {
  return { goal: { objective: '完成界面', phase, maxGoalRounds: 8, ...extra }, roundsStarted: 3 }
}

const OK = async () => ({ ok: true as const, value: undefined })

function mount(options: MountOptions = {}) {
  const projections: Record<string, unknown> = {
    goal: options.goal,
    contextPressure: options.pressure,
    contextBreakdown: options.breakdown,
    tokenUsage: options.usage,
  }
  const props = {
    sessionId: 's-test' as never,
    useProjection: ((key: string) => projections[key]) as never,
    useSessionPendingInteraction: ((select: (map: Map<string, Pick<SessionPendingInteraction, 'key' | 'kind' | 'sessionId'>>) => unknown) =>
      select(new Map(options.pending === undefined ? [] : [['s-test', options.pending]]))) as never,
    useSessions: ((select: (snapshot: { byId: Record<string, unknown> }) => unknown) => select({ byId: { 's-test': { displayTitle: '测试会话', running: options.running ?? false } } })) as never,
    useConversation: ((select: (snapshot: { views: Map<string, unknown> }) => unknown) =>
      select({ views: new Map(options.trajectory === undefined ? [] : [['trajectory', options.trajectory]]) })) as never,
    onEditGoal: (options.verbs?.onEditGoal ?? OK) as never,
    onPauseGoal: (options.verbs?.onPauseGoal ?? OK) as never,
    onResumeGoal: (options.verbs?.onResumeGoal ?? OK) as never,
    onClearGoal: (options.verbs?.onClearGoal ?? OK) as never,
    useWorkspaces: undefined as never,
    useSession: undefined as never,
    useChat: undefined as never,
    useTrajectory: undefined as never,
    useInput: undefined as never,
    inputActions: undefined as never,
  }
  return render(<LiveSignalPanel {...props} />)
}

describe('LiveSignalPanel', () => {
  it('shows native goal, context, and session status projections', () => {
    const { getByText, getByRole } = mount({
      goal: { goal: { objective: '完成界面' } },
      pressure: { projectedTokens: 250, contextWindow: 1_000 },
      running: true,
    })
    expect(getByText('完成界面')).toBeTruthy()
    expect(getByText('25%')).toBeTruthy()
    expect(getByText('运行中')).toBeTruthy()
    expect((getByRole('button', { name: /沉淀本次对话/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('labels pending work from the carrier list', () => {
    const { getByText } = mount({
      pending: { key: 'p1', kind: 'approval', sessionId: 's-test' as never },
    })
    expect(getByText('1 项待审批')).toBeTruthy()
  })

  // The breakdown proportions the provider-anchored percent rather than
  // replacing it: 25% occupancy split 1:1:3 still totals 25% of the track.
  it('splits the context meter by the contextBreakdown composition', () => {
    const { container, getByText } = mount({
      pressure: { projectedTokens: 250, contextWindow: 1_000 },
      breakdown: { systemTokens: 100, toolsTokens: 100, messageTokens: 300 },
    })
    const widths = [...container.querySelectorAll<HTMLElement>('[role="progressbar"] span')]
      .map(span => Number.parseFloat(span.style.width))
    expect(widths).toEqual([5, 5, 15])
    expect(getByText('~300')).toBeTruthy()
  })

  it('falls back to one solid fill when no breakdown has arrived', () => {
    const { container } = mount({ pressure: { projectedTokens: 250, contextWindow: 1_000 } })
    const spans = container.querySelectorAll<HTMLElement>('[role="progressbar"] span')
    expect(spans.length).toBe(1)
    expect(spans[0]?.style.width).toBe('25%')
  })

  it('reports cumulative tokenUsage with a cache rate over cacheRead plus uncached input', () => {
    const { getByText } = mount({
      usage: { uncachedInputTokens: 1_000, outputTokens: 500, cacheReadTokens: 9_000, cacheWriteTokens: 200 },
    })
    expect(getByText('缓存命中 90%')).toBeTruthy()
    expect(getByText('9K / 200')).toBeTruthy()
  })

  it('summarises the canonical trajectory view target', () => {
    const { getByText } = mount({
      trajectory: {
        eventNodes: [{ time: 1_700_000_000_000 }, { time: 1_700_000_001_000 }],
        requests: [{ status: 'running' }, { status: 'error' }, { status: 'done' }],
        runningCalls: [{}],
      },
    })
    expect(getByText('事件').nextElementSibling?.textContent).toBe('2')
    expect(getByText('请求').nextElementSibling?.textContent).toBe('3')
    expect(getByText('进行中').nextElementSibling?.textContent).toBe('2')
    expect(getByText('失败').nextElementSibling?.textContent).toBe('1')
  })

  it('says so when the trajectory view target is not mounted', () => {
    const { getByText } = mount()
    expect(getByText('轨迹 view target 尚未装载')).toBeTruthy()
  })

  // Creation is absent on purpose: the Goal Remote carries no create verb, so the card points at /goal.
  it('points a session with no goal at the /goal command instead of offering a dead control', () => {
    const { getByText, queryByRole } = mount()
    expect(getByText(/\/goal 命令/)).toBeTruthy()
    expect(queryByRole('button', { name: '编辑' })).toBeNull()
  })

  it('offers pause while the goal is active, and reports its phase and round progress', () => {
    const { getByText, getByRole, queryByRole } = mount({ goal: goalAt('active') })
    expect(getByText('进行中 · 3/8 轮')).toBeTruthy()
    expect(getByRole('button', { name: '暂停' })).toBeTruthy()
    expect(queryByRole('button', { name: '继续' })).toBeNull()
  })

  it('offers resume instead of pause while the goal is paused', () => {
    const { getByRole, queryByRole } = mount({ goal: goalAt('paused') })
    expect(getByRole('button', { name: '继续' })).toBeTruthy()
    expect(queryByRole('button', { name: '暂停' })).toBeNull()
  })

  it('shows the blocked reason the projection carries', () => {
    const { getByText } = mount({ goal: goalAt('blocked', { blockedReason: { message: '缺少写权限' } }) })
    expect(getByText('受阻原因：缺少写权限')).toBeTruthy()
  })

  it('calls the real clear verb and surfaces a returned failure rather than swallowing it', async () => {
    const onClearGoal = vi.fn(async () => ({ ok: false as const, error: { code: 'conflict', message: '目标已被其他会话修改' } }))
    const { getByRole, findByRole } = mount({ goal: goalAt('active'), verbs: { onClearGoal } })

    await act(async () => { fireEvent.click(getByRole('button', { name: '清除' })) })

    expect(onClearGoal).toHaveBeenCalledTimes(1)
    expect((await findByRole('alert')).textContent).toBe('目标已被其他会话修改')
  })

  it('edits through the real verb with the trimmed draft, then leaves edit mode', async () => {
    const onEditGoal = vi.fn(async () => ({ ok: true as const, value: undefined }))
    const { getByRole, getByLabelText, queryByLabelText } = mount({ goal: goalAt('active'), verbs: { onEditGoal } })

    fireEvent.click(getByRole('button', { name: '编辑' }))
    fireEvent.change(getByLabelText('目标内容'), { target: { value: '  换个目标  ' } })
    await act(async () => { fireEvent.click(getByRole('button', { name: '保存' })) })

    expect(onEditGoal).toHaveBeenCalledWith('换个目标')
    expect(queryByLabelText('目标内容')).toBeNull()
  })
})
