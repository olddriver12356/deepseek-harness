import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import * as plugin from '../src/index.ts'
import { Ledger } from '../src/ledger.ts'

const secret = 'test-only-peer-inbox-token-32-bytes-long'
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  delete process.env.DSH_PEER_TEST_TOKEN
})
class Model extends LlmAdapter {
  calls = 0
  text = 'reply'
  gate: Promise<void> = Promise.resolve()
  override async * stream(): AsyncIterable<StreamChunk> {
    this.calls++
    await this.gate
    yield { type: 'text-delta', index: 0, text: this.text }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
async function harness(overrides: Partial<plugin.Config> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'peer-inbox-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  for (const service of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) {
    await ctx.plugin(service)
  }
  await ctx.plugin(AgentLoop, { agents: [] })
  const model = new Model()
  ctx.llm.registerAdapter(['mock'], model)
  const handle = await ctx.agents.create({ sessionId: SessionId('owner'), agentOptions: { provider: 'mock', model: 'mock' } })
  process.env.DSH_PEER_TEST_TOKEN = secret
  const config: plugin.Config = { tokenEnv: 'DSH_PEER_TEST_TOKEN', port: 0, ledgerDir: dir, allowedSessionIds: ['owner'], maxRequestBytes: 4096, maxOutputBytes: 4096, maxConcurrentRequests: 4, maxPendingRequests: 2, maxLedgerEntries: 10, requestTimeoutMs: 1000, executionTimeoutMs: 5000, ...overrides }
  const fiber = ctx.plugin(plugin.default, config)
  await fiber
  const base = `http://127.0.0.1:${ctx.peerInbox.port}`
  const call = async (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${secret}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { code: response.status, data: await response.json() as Record<string, unknown> }
  }
  const health = await call('/v1/health')
  const input = (requestId = 'request-1') => ({ requestId, runtimeId: health.data.runtimeId, sessionId: 'owner', text: 'hello' })
  return { ctx, model, agent: handle.agent, handle, fiber, config, call, input }
}
it('authenticates health and rejects browser Origin and foreign Host', async () => {
  const h = await harness()
  expect((await h.call('/v1/health')).data).toMatchObject({ protocolVersion: 1 })
  expect((await h.call('/v1/health', undefined, { authorization: 'Bearer wrong' })).code).toBe(401)
  expect((await h.call('/v1/health', undefined, { origin: 'null' })).code).toBe(403)
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: h.ctx.peerInbox.port, path: '/v1/health', headers: { host: 'evil.example', authorization: `Bearer ${secret}` } }, (res) => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject); req.end()
  })
  expect(status).toBe(403)
})
it('settles exact claimed turn, persists duplicates and rejects changed payloads', async () => {
  const h = await harness()
  expect((await h.call('/v1/requests', h.input())).code).toBe(202)
  await h.agent.whenIdle()
  expect((await h.call('/v1/requests/request-1')).data).toMatchObject({ requestId: 'request-1', status: 'completed', text: 'reply', turn: 1 })
  expect((await h.call('/v1/requests', h.input())).code).toBe(200)
  expect((await h.call('/v1/requests', { ...h.input(), text: 'changed' })).code).toBe(409)
  expect(h.model.calls).toBe(1)
  expect(h.agent.session.snapshotEvents().find(e => e.type === 'user/message')?.data).toMatchObject({ source: { kind: 'peer-inbox' } })
})
it('rejects stale runtime, unknown sessions, oversized and extra fields', async () => {
  const h = await harness()
  expect((await h.call('/v1/requests', { ...h.input(), runtimeId: 'old' })).code).toBe(409)
  expect((await h.call('/v1/requests', { ...h.input(), sessionId: 'other' })).code).toBe(403)
  expect((await h.call('/v1/requests', { ...h.input(), extra: true })).code).toBe(400)
  expect((await h.call('/v1/requests', { ...h.input(), text: 'x'.repeat(5000) })).code).toBe(413)
  expect(h.model.calls).toBe(0)
})
it('suppresses output when foreign human input shares the claimed turn', async () => {
  const h = await harness()
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  await h.call('/v1/requests', h.input())
  h.agent.steer(createUserMessage({ content: [{ type: 'text', text: 'private human input' }], source: { kind: 'user' } }))
  gate.resolve(undefined)
  await h.agent.whenIdle()
  const result = await h.call('/v1/requests/request-1')
  expect(result.data).toMatchObject({ status: 'unknown', failureCode: 'foreign_input' })
  expect(result.data.text).toBeUndefined()
})
it('bounds pending work and withdraws queued input on timeout without canceling owner work', async () => {
  const h = await harness({ executionTimeoutMs: 60, maxPendingRequests: 1 })
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'owner work' }], source: { kind: 'user' } }))
  await h.call('/v1/requests', h.input())
  expect((await h.call('/v1/requests', h.input('request-2'))).code).toBe(429)
  await new Promise(resolve => setTimeout(resolve, 100))
  expect((await h.call('/v1/requests/request-1')).data).toMatchObject({ status: 'failed', failureCode: 'timeout_withdrawn' })
  expect(h.agent.status).toBe('running')
  gate.resolve(undefined)
  await h.agent.whenIdle()
  expect(h.model.calls).toBe(1)
})
it('suppresses a foreign plugin steering input in the same turn', async () => {
  const h = await harness()
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  await h.call('/v1/requests', h.input())
  h.agent.steer(createUserMessage({ content: [{ type: 'text', text: 'foreign private data' }], source: { kind: 'other-plugin' } }))
  gate.resolve(undefined)
  await h.agent.whenIdle()
  expect((await h.call('/v1/requests/request-1')).data).toMatchObject({ status: 'unknown', failureCode: 'foreign_input' })
})
it('suppresses preexisting next-step plugin input claimed before its own message', async () => {
  const h = await harness()
  h.agent.inject(createUserMessage({ content: [{ type: 'text', text: 'private parked context' }], source: { kind: 'other' } }))
  await h.call('/v1/requests', h.input())
  await h.agent.whenIdle()
  expect((await h.call('/v1/requests/request-1')).data).toMatchObject({ status: 'unknown', failureCode: 'foreign_input' })
})
it('reports discarded queued work without attributing the owner turn', async () => {
  const h = await harness()
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'owner' }], source: { kind: 'user' } }))
  await h.call('/v1/requests', h.input())
  h.agent.cancel({ kind: 'user' })
  gate.resolve(undefined)
  await h.agent.whenIdle()
  expect((await h.call('/v1/requests/request-1')).data).toMatchObject({ status: 'failed', failureCode: 'discarded' })
})
it('rejects a configured cold Session instead of creating or resuming it', async () => {
  const h = await harness({ allowedSessionIds: ['owner', 'cold'] })
  expect((await h.call('/v1/requests', { ...h.input(), sessionId: 'cold' })).code).toBe(409)
  expect(h.ctx.agents.list()).toHaveLength(1)
})
it('retains unknown running work on disposal and leaves its owner active', async () => {
  const h = await harness()
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  await h.call('/v1/requests', h.input())
  await h.fiber.dispose()
  expect(h.agent.status).toBe('running')
  await h.ctx.plugin(plugin.default, h.config)
  const response = await fetch(`http://127.0.0.1:${h.ctx.peerInbox.port}/v1/requests/request-1`, { headers: { authorization: `Bearer ${secret}` } })
  expect(await response.json()).toMatchObject({ status: 'unknown', failureCode: 'plugin_disposed_execution_unknown' })
  gate.resolve(undefined)
  await h.agent.whenIdle()
})
it('bounds the complete multibyte output rather than only character count', async () => {
  const h = await harness({ maxOutputBytes: 512 })
  h.model.text = '界'.repeat(180)
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  await h.call('/v1/requests', h.input())
  h.ctx.on('session/event', (session, event) => {
    if (session === h.agent.session && event.type === 'assistant/message') expect(event.data.turn).toBe(1)
  })
  gate.resolve(undefined)
  await h.agent.whenIdle()
  const result = await h.call('/v1/requests/request-1')
  expect(result.data).toMatchObject({ status: 'failed', failureCode: 'output_limit' })
  expect(result.data.text).toBeUndefined()
  expect(Buffer.byteLength(JSON.stringify(result.data))).toBeLessThanOrEqual(512)
})
it('withdraws a retained ambiguous queue item when the plugin reopens', async () => {
  const h = await harness()
  await h.fiber.dispose()
  const gate = Promise.withResolvers<undefined>()
  h.model.gate = gate.promise
  cleanups.push(async () => { gate.resolve(undefined) })
  h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'owner' }], source: { kind: 'user' } }))
  const old = createUserMessage({ content: [{ type: 'text', text: 'ambiguous' }], source: { kind: 'peer-inbox' } })
  h.agent.followup(old)
  const ledger = new Ledger(h.config.ledgerDir, 10, 4096)
  ledger.put({ fingerprint: 'a'.repeat(64), sessionId: 'owner', messageId: old.id, result: { requestId: 'old-request', status: 'queued' } })
  ledger.close()
  await h.ctx.plugin(plugin.default, h.config)
  expect(h.agent.inbox.nextTurn.some(message => message.id === old.id)).toBe(false)
  gate.resolve(undefined)
  await h.agent.whenIdle()
  expect(h.model.calls).toBe(1)
})
it('releases the writer lock if startup reconciliation throws', async () => {
  const h = await harness()
  await h.fiber.dispose()
  const old = createUserMessage({ content: [{ type: 'text', text: 'ambiguous' }], source: { kind: 'peer-inbox' } })
  h.agent.inject(old)
  const ledger = new Ledger(h.config.ledgerDir, 10, 4096)
  ledger.put({ fingerprint: 'a'.repeat(64), sessionId: 'owner', messageId: old.id, result: { requestId: 'old-request', status: 'queued' } })
  ledger.close()
  const remove = vi.spyOn(h.agent.inbox, 'remove').mockImplementation(() => { throw new Error('storage failed') })
  try { await expect(h.ctx.plugin(plugin.default, h.config)).rejects.toThrow('storage failed') } finally { remove.mockRestore() }
  const reopened = new Ledger(h.config.ledgerDir, 10, 4096)
  reopened.close()
})
it('retains idempotence across clean plugin reload', async () => {
  const h = await harness()
  const original = h.input()
  await h.call('/v1/requests', original)
  await h.agent.whenIdle()
  await h.fiber.dispose()
  await h.ctx.plugin(plugin.default, h.config)
  const response = await fetch(`http://127.0.0.1:${h.ctx.peerInbox.port}/v1/requests`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(original) })
  expect(response.status).toBe(200)
  expect(h.model.calls).toBe(1)
})

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'other': { kind: 'other' } & import('@deepseek-ai/dsh-llm').ContextFormed
    'other-plugin': { kind: 'other-plugin' }
  }
}
