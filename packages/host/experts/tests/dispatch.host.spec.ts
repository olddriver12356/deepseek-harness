import { describe, expect, it } from 'vitest'
import { buildStartRequest } from '../src/dispatch.ts'
import { dispatchable, resolveExpert, rosterDescription, runExpertTool } from '../src/tool.ts'
import type { ExpertRecord } from '../src/types.ts'

const base: ExpertRecord = {
  id: 'agent-test',
  name: 'Root Cause Expert',
  category: 'Engineering',
  description: 'Trace the real call path.',
  instructions: 'Reproduce before changing code.',
  status: 'approved',
  execution: 'delegated',
  model: 'inherit',
  reasoning: 'inherit',
  updatedAt: '2026-09-06',
}

describe('buildStartRequest', () => {
  it('uses the instructions as the shadowing persona and the task as the prompt', () => {
    const request = buildStartRequest(base, 'Why does login fail?')
    expect(request.persona).toBe('Reproduce before changing code.')
    expect(request.prompt).toBe('Why does login fail?')
    expect(request.label).toBe('Root Cause Expert')
  })

  it('omits agentOptions entirely when model and reasoning both inherit', () => {
    expect(buildStartRequest(base, 'task').agentOptions).toBeUndefined()
  })

  it('sets only the overridden route fields', () => {
    const request = buildStartRequest({ ...base, model: 'deepseek-chat' }, 'task')
    expect(request.agentOptions).toEqual({ model: 'deepseek-chat' })
  })

  it('carries a reasoning override without a model override', () => {
    const request = buildStartRequest({ ...base, reasoning: 'high' }, 'task')
    expect(request.agentOptions).toEqual({ reasoningEffort: 'high' })
  })

  it('refuses to dispatch an Expert that is not delegated', () => {
    expect(() => buildStartRequest({ ...base, execution: 'conversational' }, 'task'))
      .toThrow('experts: only a delegated Expert can be dispatched as a subagent')
  })

  it('refuses to dispatch an Expert that is not approved', () => {
    expect(() => buildStartRequest({ ...base, status: 'draft' }, 'task'))
      .toThrow('experts: only an approved Expert can be dispatched')
  })

  it('refuses an empty task', () => {
    expect(() => buildStartRequest(base, '   ')).toThrow('experts: dispatch requires a task')
  })
})

const CONVERSATIONAL: ExpertRecord = { ...base, id: 'agent-conv', name: 'Socratic Expert', execution: 'conversational' }
const DRAFT: ExpertRecord = { ...base, id: 'agent-draft', name: 'Draft Expert', status: 'draft' }
const ROSTER = [base, CONVERSATIONAL, DRAFT]

describe('Expert roster resolution', () => {
  it('offers only Experts that are both approved and delegated', () => {
    expect(dispatchable(ROSTER).map(record => record.name)).toEqual(['Root Cause Expert'])
  })

  it('resolves an exact name', () => {
    expect(resolveExpert(ROSTER, 'Root Cause Expert').id).toBe('agent-test')
  })

  it('resolves a unique case-insensitive name and tolerates surrounding space', () => {
    expect(resolveExpert(ROSTER, '  root cause expert ').id).toBe('agent-test')
  })

  it('refuses a conversational Expert and names what is available', () => {
    expect(() => resolveExpert(ROSTER, 'Socratic Expert'))
      .toThrow('experts: no approved delegated Expert named "Socratic Expert". Available: Root Cause Expert')
  })

  it('refuses a draft Expert even when it is delegated', () => {
    expect(() => resolveExpert(ROSTER, 'Draft Expert')).toThrow('no approved delegated Expert')
  })

  it('refuses an ambiguous loose match instead of picking one', () => {
    const twin: ExpertRecord = { ...base, id: 'agent-twin', name: 'ROOT CAUSE EXPERT' }
    expect(() => resolveExpert([base, twin], 'root cause expert'))
      .toThrow('matches more than one Expert')
  })

  it('reports an empty roster instead of an empty list', () => {
    expect(() => resolveExpert([CONVERSATIONAL], 'anything'))
      .toThrow('(none: no Expert is both approved and delegated)')
  })

  it('describes the dispatchable roster for the model', () => {
    expect(rosterDescription(ROSTER)).toContain('"Root Cause Expert" (Trace the real call path.)')
    expect(rosterDescription(ROSTER)).not.toContain('Socratic')
  })

  it('says so when nothing is dispatchable', () => {
    expect(rosterDescription([CONVERSATIONAL])).toContain('No Expert is currently approved and delegated')
  })
})

describe('runExpertTool', () => {
  const agent = { id: 'parent-agent' }
  const roster = { list: () => Promise.resolve(ROSTER) }
  function ctxReturning(result: Record<string, unknown>, started: unknown[] = []) {
    let disposed = 0
    return {
      disposals: () => disposed,
      ctx: {
        tools: { register: () => () => {} },
        subagents: {
          start: (name: string, request: Record<string, unknown>) => {
            started.push({ name, request })
            return Promise.resolve({
              result: Promise.resolve(result as never),
              dispose: () => { disposed += 1 },
            })
          },
        },
      },
    }
  }

  it('forks with the Expert persona and returns the child report to the turn', async () => {
    const started: unknown[] = []
    const { ctx } = ctxReturning(
      { output: [{ type: 'text', text: 'traced to a stale build' }], stopReason: 'completed' },
      started,
    )
    const value = await runExpertTool(ctx, roster, { expert: 'Root Cause Expert', task: 'Why does login fail?' }, {
      agent, signal: new AbortController().signal,
    })
    expect(value).toEqual({ expert: 'Root Cause Expert', text: 'traced to a stale build' })
    const [call] = started as { name: string; request: Record<string, unknown> }[]
    expect(call?.name).toBe('fork')
    expect(call?.request.persona).toBe('Reproduce before changing code.')
    // The calling Agent is the fork parent, so the child hangs off this turn.
    expect(call?.request.parent).toBe(agent)
    expect(call?.request.prompt).toBe('Why does login fail?')
  })

  it('requires a calling Agent', async () => {
    const { ctx } = ctxReturning({ output: [], stopReason: 'completed' })
    await expect(runExpertTool(ctx, roster, { expert: 'Root Cause Expert', task: 'task' }, {
      signal: new AbortController().signal,
    })).rejects.toThrow('dispatch_expert requires a calling agent')
  })

  it('surfaces a non-completed run instead of returning empty text', async () => {
    const { ctx } = ctxReturning({ output: [], stopReason: 'error', diagnostic: 'provider lacks persona' })
    await expect(runExpertTool(ctx, roster, { expert: 'Root Cause Expert', task: 'task' }, {
      agent, signal: new AbortController().signal,
    })).rejects.toThrow('experts: "Root Cause Expert" ended as "error": provider lacks persona')
  })

  it('releases the run even when it fails', async () => {
    const failing = ctxReturning({ output: [], stopReason: 'error' })
    await expect(runExpertTool(failing.ctx, roster, { expert: 'Root Cause Expert', task: 'task' }, {
      agent, signal: new AbortController().signal,
    })).rejects.toThrow('ended as "error"')
    expect(failing.disposals()).toBe(1)
  })

  it('honours a turn that was already cancelled', async () => {
    const started: unknown[] = []
    const { ctx } = ctxReturning({ output: [], stopReason: 'completed' }, started)
    const controller = new AbortController()
    controller.abort()
    await expect(runExpertTool(ctx, roster, { expert: 'Root Cause Expert', task: 'task' }, {
      agent, signal: controller.signal,
    })).rejects.toThrow()
    expect(started).toHaveLength(0)
  })

  it('returns empty text when a completed child produced no output', async () => {
    const { ctx } = ctxReturning({ output: [], stopReason: 'completed' })
    await expect(runExpertTool(ctx, roster, { expert: 'Root Cause Expert', task: 'task' }, {
      agent, signal: new AbortController().signal,
    })).resolves.toEqual({ expert: 'Root Cause Expert', text: '' })
  })
})
