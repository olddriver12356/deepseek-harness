import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { SessionId } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import Subagents from '@deepseek-ai/dsh-subagent'
import { queueHostSubagentPrompt } from '@deepseek-ai/dsh-subagent/internal'
import * as Spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { describe, expect, it, vi } from 'vitest'
import { MockAdapter, textResponse, toolCallResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { TestSessionQuery } from '../../../subagent/subagent/tests/test-session-query.ts'
import { loadStoredSession } from '../../../subagent/subagent/tests/persistence-helpers.ts'
import Experts from '../src/index.ts'
import type {} from '../src/policy.ts'
import * as ExpertTool from '../src/tool.ts'

describe('expert continuation through Loader', () => {
  it.each(['read-only', 'write'] as const)('enforces %s on execution and cold resume, with a durable admission receipt', { timeout: 30_000 }, async (access) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-expert-continuation-'))
    const ctx = new Context()
    try {
      const directory = join(root, 'Agents', '5 Methods', 'Experts', 'Reviewer')
      await mkdir(directory, { recursive: true })
      await writeFile(join(root, 'Agents', 'Artifact Schema v1.md'), '# Test schema\n')
      await writeFile(join(directory, 'ARTIFACT.md'), '---\nid: "reviewer"\ntitle: "Reviewer"\nartifact_type: "Method"\nmethod_kind: "Expert"\nexpert_status: "approved"\nexecution: "delegated"\ncategory: "Engineering"\ndescription: "Review code"\n---\n\n## Instructions\n\nInvestigate the assigned task.\n')
      let writes = 0
      const dependencies = { name: 'fixture-dependencies', async apply(scope: Context) {
        await mountAgentLoopTestDependencies(scope)
        scope.tools.register({ name: 'write', description: 'Write a test file', parameters: { type: 'object', properties: {} },
          output: { schema: { type: 'string' }, render: (_args: unknown, value: string) => [{ type: 'text' as const, text: value }] },
          execute: async () => { writes++; return 'written' },
        })
      } }
      const configPath = join(root, 'cordis.yml')
      await writeFile(configPath, JSON.stringify([
        { name: 'persistence', config: { root: join(root, 'sessions') } },
        { name: 'loop', config: { agents: [] } },
        { name: 'query' }, { name: 'subagents' }, { name: 'spawn' },
        { name: 'experts', config: { vaultRoot: root } },
        { name: 'expert-tool', config: { vaultRoot: root } },
      ]))
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await dependencies.apply(ctx)
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['fixture-dependencies', dependencies], ['persistence', JsonlSessionPersistence], ['loop', AgentLoop],
        ['query', TestSessionQuery], ['subagents', Subagents], ['spawn', Spawn], ['experts', Experts], ['expert-tool', ExpertTool],
      ])
      ctx.loader.internal = { version: 'v2', async import(name: string) {
        if (!modules.has(name)) throw new Error(`Unknown fixture module ${name}`)
        return modules.get(name)
      } } as never
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
      await ctx.loader.await()
      ctx.llm.registerAdapter(['mock'], new MockAdapter([
        toolCallResponse('write-1', 'write', {}), textResponse('Write denied; investigation report.'),
        textResponse('Parent received the report.'),
        toolCallResponse('write-2', 'write', {}), textResponse('Still read-only after resume.'),
        textResponse('Parent received the follow-up.'),
      ]))
      const parent = await ctx.agentLoop.create(SessionId('expert-parent'), { provider: 'mock', model: 'mock' })
      ctx.on('agent/created', ({ agent }) => {
        if (agent.session.header.parentSession === undefined) return
        // A scoped override must not escape the final guard, including after cold resume.
        agent.ctx.tools.register({ ...ctx.tools.get('write')!, execute: async () => { writes++; return 'scoped write' } })
      })
      const roster = { list: async () => (await ctx.experts.list()).map(expert => ({ ...expert, access })) }
      const [expert] = await roster.list()
      const releaseFirst = ctx.experts.reserveDelegation(parent, SessionId('reserved-one'), expert!)
      const releaseSecond = ctx.experts.reserveDelegation(parent, SessionId('reserved-two'), expert!)
      expect(() => ctx.experts.reserveDelegation(parent, SessionId('reserved-three'), expert!)).toThrow('concurrent delegation limit')
      releaseFirst(); releaseSecond()
      const result = await ExpertTool.runExpertTool(ctx as never, roster,
        { expert: 'reviewer', task: 'Inspect the failure without editing.' }, { agent: parent, signal: new AbortController().signal })
      await vi.waitFor(() => { expect(ctx.agents.get(result.childId)).toBeUndefined() })
      const first = await loadStoredSession(ctx.sessionPersistence, result.childId)
      expect(first.events.filter(event => event.type === 'experts/delegation')).toHaveLength(1)
      expect(first.events.filter(event => event.type === 'tool/result').map(event => event.data.message.content[0].isError === true)).toEqual([access === 'read-only'])
      expect(writes).toBe(access === 'read-only' ? 0 : 1)
      await parent.whenIdle()
      await queueHostSubagentPrompt(ctx.subagents, parent, result.childId,
        [{ type: 'text', text: 'Try again.' }], { kind: 'user' }, new AbortController().signal)
      await vi.waitFor(() => { expect(ctx.agents.get(result.childId)).toBeUndefined() })
      expect(writes).toBe(access === 'read-only' ? 0 : 2)
      const resumed = await loadStoredSession(ctx.sessionPersistence, result.childId)
      expect(resumed.events.filter(event => event.type === 'experts/delegation')).toHaveLength(1)
      expect(resumed.events.filter(event => event.type === 'tool/result').map(event => event.data.message.content[0].isError === true)).toEqual([access === 'read-only', access === 'read-only'])
      expect({ ...result, access: '<access>', childId: '<child>', parentSessionId: '<parent>' }).toMatchInlineSnapshot(`
        {
          "access": "<access>",
          "childId": "<child>",
          "contextMode": "fresh",
          "expert": "Reviewer",
          "expertId": "reviewer",
          "parentSessionId": "<parent>",
          "status": "started",
        }
      `)
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
