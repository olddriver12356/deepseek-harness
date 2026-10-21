import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { conversationClearProjection } from '../src/projection.ts'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

import * as clearImplementation from '../src/index.ts'
const implementations = { '../src/index.ts': clearImplementation }
const roots: string[] = []
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-clear-'))
  roots.push(root)
  const ctx = new Context()
  contexts.push(ctx)
  const adapter = new MockAdapter([textResponse('old assistant'), textResponse('new assistant')])
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt, { personaPrefix: 'Keep the system instructions.' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions'), compression: 'none' })
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(TokenMeter)
  await ctx.plugin(CommandRuntime)
  ctx.llm.registerAdapter(['mock'], adapter)
  let flushes = 0
  ctx.on('session/flush', () => { flushes += 1 })
  const plugin = implementations['../src/index.ts']
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (specifier !== '@test/command-clear') throw new Error(`Unexpected module: ${specifier}`)
      return plugin
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  const config = join(root, 'cordis.yml')
  await writeFile(config, plugin === undefined ? '[]\n' : "- name: '@test/command-clear'\n")
  const fiber = await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  const agent = await ctx.agentLoop.create(SessionId('clear-test'), { provider: 'mock', model: 'mock' })
  const run = (line = '/clear') => ctx.commands.execute(agent, line, [], new AbortController().signal)
  return { ctx, adapter, agent, run, fiber, flushes: () => flushes }
}

it('registers globally through Loader and removes the command when unloaded', async () => {
  const test = await harness()
  expect(test.ctx.commands.list(test.agent).map(item => item.name)).toContain('clear')
  const second = await test.ctx.agentLoop.create(SessionId('other-workspace'), { provider: 'mock', model: 'mock' })
  expect(test.ctx.commands.list(second).map(item => item.name)).toContain('clear')
  const commands = test.ctx.commands
  await test.ctx.fiber.dispose()
  expect(commands.find(test.agent, 'clear')).toBeUndefined()
})

it('reuses the same Session with no old conversation, preserves audit history and survives replay', async () => {
  const test = await harness()
  test.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'SECRET_OLD_CONTEXT' }], source: { kind: 'user' } }))
  await test.agent.whenIdle()
  const original = test.agent.session.snapshotEvents()
  test.agent.inject(createUserMessage({ content: [{ type: 'text', text: 'STALE_PENDING' }], source: { kind: 'user' } }))
  const result = await test.run()
  expect(result?.result.kind).toBe('success')
  expect(test.agent.session.id).toBe('clear-test')
  const folded = test.agent.session.snapshotEvents().reduce(conversationClearProjection.apply, conversationClearProjection.init())
  expect(folded.throughSeq).toBeGreaterThan(original.at(-1)!.seq)
  expect(conversationClearProjection.wire.view(folded).throughSeq).not.toBeNull()
  expect(test.agent.inbox.nextStep).toEqual([])
  expect(test.agent.session.snapshotEvents().slice(0, original.length)).toEqual(original)
  const replay = Session.create(SessionId('replay'), test.agent.session.snapshotEvents())
  expect(replay.deriveMessages()).toEqual(test.agent.session.deriveMessages())
  expect(JSON.stringify(replay.deriveMessages())).not.toContain('SECRET_OLD_CONTEXT')
  expect(test.flushes()).toBeGreaterThan(0)
  test.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'fresh question' }], source: { kind: 'user' } }))
  await test.agent.whenIdle()
  const request = test.adapter.requests.at(-1)!
  expect(JSON.stringify(request.messages)).not.toContain('SECRET_OLD_CONTEXT')
  expect(JSON.stringify(request.messages)).not.toContain('old assistant')
  expect(JSON.stringify(request.messages)).not.toContain('STALE_PENDING')
  expect(JSON.stringify(request.messages)).toContain('Keep the system instructions.')
  expect(JSON.stringify(request.messages)).toContain('fresh question')
})

it('rejects arguments and concurrent maintenance without rewriting history', async () => {
  const test = await harness()
  expect((await test.run('/clear unexpected'))?.result.kind).toBe('error')
  const release = Promise.withResolvers<undefined>()
  const maintenance = test.agent.runMaintenance(() => release.promise)
  try { expect((await test.run())?.result.kind).toBe('error') }
  finally { release.resolve(undefined); await maintenance }
  expect(test.agent.session.deriveMessages()).toEqual([])
})

it('handles empty and repeated clears without adding model-visible text', async () => {
  const test = await harness()
  expect((await test.run())?.result.kind).toBe('success')
  expect((await test.run())?.result.kind).toBe('success')
  expect(test.agent.session.deriveMessages()).toEqual([])
})
