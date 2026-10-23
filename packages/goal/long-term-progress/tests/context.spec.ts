import { describe, expect, it } from 'vitest'
import { agentEvents, type PreStepDecision } from '@deepseek-ai/dsh-agent'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { createUserMessage, LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import LongTermProgress from '../src/index.ts'
import { harness, milestones } from './consumer-harness.ts'

async function prepare(h: Awaited<ReturnType<typeof harness>>, turn: number, step: number,
  fallback?: () => Promise<PreStepDecision>, signal = new AbortController().signal) {
  const message = createUserMessage({ content: [{ type: 'text', text: 'Work' }], source: { kind: 'user' } })
  return agentEvents(h.ctx, h.agent).waterfall('agent/pre-step', { messages: [message], turn, step, signal },
    fallback ?? (async () => ({ kind: 'enter' as const, messages: [message], startsRequestSeries: true })))
}
function commit(h: Awaited<ReturnType<typeof harness>>, decision: PreStepDecision) {
  if (decision.kind === 'enter') for (const message of decision.messages)
    h.session.append('user/message', message, { surfaceOp: 'append' })
}
function reminders(decision: PreStepDecision) {
  return decision.kind === 'reject' ? [] : decision.messages.filter(m => m.source.kind === 'long-term-progress')
}

class RecordingAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  override async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    if (this.requests.length === 1) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('tick'), name: 'tick', arguments: '{}' } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    } else {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Done' } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

describe('admitted-turn progress context', () => {
  it('logs the same snapshot the real loop sends and retains it across tool-followup requests', async () => {
    const ctx = new Context()
    try {
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(AgentLoop, { agents: [] })
      await ctx.plugin(LongTermProgress)
      const adapter = new RecordingAdapter()
      ctx.llm.registerAdapter(['mock'], adapter)
      ctx.tools.register(defineContentToolFixture({ name: 'tick', description: 'Return observed evidence', parameters: {},
        async execute() { return [{ type: 'text', text: 'Passed' }] } }))
      const agent = await ctx.agentLoop.create(SessionId(randomUUID()), { provider: 'mock', model: 'mock' })
      ctx.longTermProgress.change(agent, { revision: 0 }, { kind: 'replace', milestones }, { kind: 'human', source: 'command' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Work' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(2)
      const committed = agent.session.snapshotEvents().filter(e => e.type === 'user/message' && e.data.source.kind === 'long-term-progress')
      expect(committed).toHaveLength(1)
      for (const request of adapter.requests) {
        const texts = request.messages.flatMap(m => m.content).filter(b => b.type === 'text').map(b => b.text)
        expect(texts.filter(t => t.includes('Long-term progress revision 1'))).toHaveLength(1)
        expect(texts.join('\n')).not.toContain('Private implementation')
      }
    } finally { await ctx.fiber.dispose() }
  })
  it('adds nothing before a list and records one compact snapshot per admitted turn, not per tool step', async () => {
    const h = await harness()
    h.open()
    expect(reminders(await prepare(h, 1, 1))).toEqual([])
    h.change({ kind: 'replace', milestones })
    const first = await prepare(h, 1, 1)
    expect(first).toMatchObject({ startsRequestSeries: true })
    expect(reminders(first)).toHaveLength(1)
    const text = JSON.stringify(reminders(first))
    for (const expected of ['Foundation', 'Durable state', 'Delivery', 'Ship verified work', 'awaiting authorization', 'revision 1']) expect(text).toContain(expected)
    for (const excluded of ['Private checkpoint', 'Private implementation', 'private-spec', 'private-plan']) expect(text).not.toContain(excluded)
    commit(h, first)
    expect(reminders(await prepare(h, 1, 2))).toEqual([])
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    h.open(2, false)
    expect(reminders(await prepare(h, 2, 1))).toHaveLength(1)
  })

  it('delegates rejection and abort without appending or suppressing the next admission', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    h.open()
    const before = h.session.seq
    expect((await prepare(h, 1, 1, async () => ({ kind: 'reject' }))).kind).toBe('reject')
    const controller = new AbortController()
    const aborted = await prepare(h, 1, 1, async () => {
      controller.abort()
      return { kind: 'enter', messages: [] }
    }, controller.signal)
    expect(reminders(aborted)).toEqual([])
    expect(h.session.seq).toBe(before)
    expect(reminders(await prepare(h, 1, 1, async () => ({ kind: 'enter', messages: [] })))).toEqual([])
    expect(reminders(await prepare(h, 1, 1))).toHaveLength(1)
  })

  it('supersedes prior revisions, including an explicitly emptied list', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    h.open()
    commit(h, await prepare(h, 1, 1))
    h.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    h.change({ kind: 'replace', milestones: [] })
    h.open(2)
    const next = await prepare(h, 2, 1)
    expect(reminders(next)).toHaveLength(1)
    expect(JSON.stringify(reminders(next))).toContain('revision 2')
    expect(JSON.stringify(reminders(next))).toContain('supersedes all earlier progress snapshots')
    expect(JSON.stringify(reminders(next))).toContain('No milestones')
    commit(h, next)
    await h.fiber.dispose()
    expect(reminders(await prepare(h, 2, 2))).toEqual([])
  })
})
