import { afterEach, expect, it } from 'vitest'
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
import { pathToFileURL } from 'node:url'
import PeerInbox from '../src/index.ts'

// The canonical relay belongs to a separate checkout; this explicit integration
// gate never resolves or mutates a live OpenClaw installation.
const relaySource = process.env.DSH_RELAY_SOURCE
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  delete process.env.DSH_PEER_INTEGRATION_TOKEN
})
class Model extends LlmAdapter {
  calls = 0
  readonly entered = Promise.withResolvers<undefined>()
  readonly release = Promise.withResolvers<undefined>()
  override async * stream(): AsyncIterable<StreamChunk> {
    this.calls++
    if (this.calls === 1) { this.entered.resolve(undefined); await this.release.promise }
    yield { type: 'text-delta', index: 0, text: this.calls === 1 ? 'private owner result' : 'remote result' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
it.skipIf(!relaySource)('canonical relay queues behind owner work, returns only its turn and deduplicates', async () => {
  if (!relaySource) throw new Error('DSH_RELAY_SOURCE is required')
  const { createDshPeer } = await import(pathToFileURL(relaySource).href) as {
    createDshPeer: (options: {
      config: Record<string, unknown>
      ownerId: string
      ownerDmChannelId: string
      env: Record<string, string>
      send(value: { channelId: string; threadTs: string; text: string }): Promise<void>
      testLimits: { pollIntervalMs: number; requestTimeoutMs: number }
    }) => {
      start(options: { stateDir: string }): Promise<void>
      stop(): Promise<void>
      handle(event: Record<string, string>, context: Record<string, string>): Promise<{ handled: boolean }>
    }
  }
  const dir = await mkdtemp(join(tmpdir(), 'peer-relay-integration-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  for (const service of [LlmRuntime, SessionStore, SessionProjectionRegistry, SystemPrompt, ToolRuntime, AgentRegistry]) {
    await ctx.plugin(service)
  }
  await ctx.plugin(AgentLoop, { agents: [] })
  const model = new Model()
  cleanups.push(async () => { model.release.resolve(undefined) })
  ctx.llm.registerAdapter(['mock'], model)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('owner'), agentOptions: { provider: 'mock', model: 'mock' } })
  const token = 'integration-only-token-with-over-32-bytes'
  process.env.DSH_PEER_INTEGRATION_TOKEN = token
  await ctx.plugin(PeerInbox, {
    tokenEnv: 'DSH_PEER_INTEGRATION_TOKEN', port: 0, ledgerDir: join(dir, 'host'), allowedSessionIds: ['owner'],
    maxRequestBytes: 32768, maxOutputBytes: 8192, maxConcurrentRequests: 4, maxPendingRequests: 4,
    maxLedgerEntries: 100, requestTimeoutMs: 1000, executionTimeoutMs: 10000,
  })
  const sent: { channelId: string; threadTs: string; text: string }[] = []
  const relay = createDshPeer({
    config: { enabled: true, baseUrl: `http://127.0.0.1:${ctx.peerInbox.port}`, sessionId: 'owner', tokenEnv: 'DSH_PEER_INTEGRATION_TOKEN', ledgerDir: join(dir, 'relay') },
    ownerId: 'U1', ownerDmChannelId: 'D1', env: { DSH_PEER_INTEGRATION_TOKEN: token },
    send: async (value: { channelId: string; threadTs: string; text: string }) => { sent.push(value) },
    testLimits: { pollIntervalMs: 20, requestTimeoutMs: 1000 },
  })
  await relay.start({ stateDir: dir })
  cleanups.push(() => relay.stop())
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'owner work' }], source: { kind: 'user' } }))
  await model.entered.promise
  const event = { cleanedBody: 'dsh: reply to remote request', messageId: '1700000000.000001', threadTs: '1699999999.000001' }
  const context = { messageProvider: 'slack', senderId: 'U1', chatId: 'D1', accountId: 'default' }
  expect((await relay.handle(event, context)).handled).toBe(true)
  await expect.poll(() => agent.inbox.nextTurn.length).toBe(1)
  expect(model.calls).toBe(1)
  expect(sent).toEqual([])
  model.release.resolve(undefined)
  await agent.whenIdle()
  await expect.poll(() => sent.length).toBe(1)
  expect(sent[0]).toMatchObject({ channelId: 'D1', threadTs: '1699999999.000001' })
  expect(sent[0]?.text).toContain('remote result')
  expect(sent[0]?.text).not.toContain('private owner result')
  await relay.handle(event, context)
  expect(model.calls).toBe(2)
  expect(sent).toHaveLength(1)
}, 20000)
