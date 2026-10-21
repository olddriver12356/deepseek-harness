import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SessionPersistence from '@deepseek-ai/dsh-session-persistence'
import * as SessionPersistenceJsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import PeerInbox from '../src/index.ts'

// Owner-run identity probe: resumes one real persisted Session and drives one
// real relay request into it. Requires explicit opt-in through DSH_PROBE_SESSION.
const probeSession = process.env.DSH_PROBE_SESSION
const relaySource = process.env.DSH_RELAY_SOURCE
const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  delete process.env.DSH_PROBE_TOKEN
})
interface RelayModule {
  createDshPeer: (options: Record<string, unknown>) => {
    start(context: { stateDir: string }): Promise<void>
    stop(): Promise<void>
    handle(event: Record<string, unknown>, context: Record<string, unknown>): Promise<{ reply?: { text: string } } | undefined>
  }
}
it.skipIf(!probeSession || !relaySource)('delivers one relay request into the named live Session', async () => {
  if (probeSession === undefined || relaySource === undefined) throw new Error('probe environment required')
  const { createDshPeer } = await import(pathToFileURL(relaySource).href) as RelayModule
  const dir = await mkdtemp(join(tmpdir(), 'peer-probe-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  for (const service of [
    LlmRuntime, SessionStore, SessionProjectionRegistry, SessionPersistence,
    SystemPrompt, ToolRuntime, AgentRegistry,
  ]) await ctx.plugin(service)
  await ctx.plugin(SessionPersistenceJsonl, { root: join(process.env.USERPROFILE ?? '', '.dsh', 'sessions') })
  await ctx.plugin(AgentLoop, { agents: [] })
  const { agent } = await ctx.agents.resume({ resumeSessionId: SessionId(probeSession) })
  expect(agent.id).toBe(probeSession)
  const token = 'owner-probe-secret-value-at-least-32-bytes'
  process.env.DSH_PROBE_TOKEN = token
  await ctx.plugin(PeerInbox, {
    tokenEnv: 'DSH_PROBE_TOKEN', port: 0, ledgerDir: join(dir, 'host'), allowedSessionIds: [probeSession],
    maxRequestBytes: 32768, maxOutputBytes: 8192, maxConcurrentRequests: 4, maxPendingRequests: 4,
    maxLedgerEntries: 100, requestTimeoutMs: 5000, executionTimeoutMs: 600000,
  })
  const sent: { channelId: string; threadTs: string; text: string }[] = []
  const relay = createDshPeer({
    config: { enabled: true, baseUrl: `http://127.0.0.1:${ctx.peerInbox.port}`, sessionId: probeSession, tokenEnv: 'DSH_PROBE_TOKEN', ledgerDir: join(dir, 'relay') },
    ownerId: 'U1', ownerDmChannelId: 'D1', env: { DSH_PROBE_TOKEN: token },
    send: async (value: { channelId: string; threadTs: string; text: string }) => { sent.push(value) },
    testLimits: { pollIntervalMs: 200, requestTimeoutMs: 5000 },
  })
  await relay.start({ stateDir: dir })
  cleanups.push(() => relay.stop())
  const prompt = 'dsh: Identity probe. Reply with exactly one short line naming this session title and its workspace path, nothing else.'
  const result = await relay.handle(
    { cleanedBody: prompt, messageId: '1700000000.000777', threadTs: '1700000000.000777' },
    { messageProvider: 'slack', senderId: 'U1', chatId: 'D1', accountId: 'default' },
  )
  expect(result?.reply?.text).toMatch(/RECEIVED/)
  await agent.whenIdle()
  await expect.poll(() => sent.length, { timeout: 300000, interval: 500 }).toBeGreaterThan(0)
  const reply = sent.at(-1)
  console.log('PROBE_SESSION_ID', agent.id)
  console.log('PROBE_WORKSPACE', agent.session.header.cwd)
  console.log('PROBE_THREAD', reply?.threadTs)
  console.log('PROBE_REPLY', reply?.text)
  expect(reply?.channelId).toBe('D1')
  expect(reply?.threadTs).toBe('1700000000.000777')
}, 360000)
