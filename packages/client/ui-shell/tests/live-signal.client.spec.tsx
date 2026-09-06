// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LiveSignalPanel } from '@deepseek-ai/dsh-client-ui-shell/src/client/LiveSignalPanel.tsx'
import type { SessionPendingInteraction } from '@deepseek-ai/dsh-client-ui-session/client'

afterEach(cleanup)

function mount(options: { goal?: unknown; pressure?: unknown; pending?: Pick<SessionPendingInteraction, 'key' | 'kind' | 'sessionId'>; running?: boolean } = {}) {
  const props = {
    sessionId: 's-test' as never,
    useProjection: ((key: string) => key === 'goal' ? options.goal : options.pressure) as never,
    useSessionPendingInteraction: ((select: (map: Map<string, Pick<SessionPendingInteraction, 'key' | 'kind' | 'sessionId'>>) => unknown) =>
      select(new Map(options.pending === undefined ? [] : [['s-test', options.pending]]))) as never,
    useSessions: ((select: (snapshot: { byId: Record<string, unknown> }) => unknown) => select({ byId: { 's-test': { displayTitle: '测试会话', running: options.running ?? false } } })) as never,
    useWorkspaces: undefined as never,
    useSession: undefined as never,
    useConversation: undefined as never,
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

  it('keeps deferred actions disabled and labels pending work from the carrier list', () => {
    const { getByText, getByRole } = mount({
      pending: { key: 'p1', kind: 'approval', sessionId: 's-test' as never },
    })
    expect(getByText('1 项待审批')).toBeTruthy()
    expect((getByRole('button', { name: /查看完整轨迹/ }) as HTMLButtonElement).disabled).toBe(true)
  })
})
