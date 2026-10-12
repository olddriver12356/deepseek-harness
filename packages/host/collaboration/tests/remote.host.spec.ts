import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Typert from '@deepseek-ai/dsh-typert-registry'
import { afterEach, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import * as Collaboration from '../src/index.ts'
import { applyDiscussionOperation } from '../src/state.ts'
import { connectionIdSchema, peerMessageIdSchema } from '../src/schema.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanups.length > 0) await cleanups.pop()!() })

interface WireResult {
  readonly ok: boolean
  readonly value?: {
    readonly revision: number
    readonly connectionId?: string
    readonly registrations?: readonly { readonly sessionId: string; readonly cwd: string }[]
    readonly connections?: readonly { readonly id: string; readonly paused: boolean; readonly budget: { readonly limit: number } }[]
  }
  readonly error?: { readonly code: string; readonly message: string }
}

async function load() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-collaboration-remote-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  const modules = new Map<string, unknown>([
    ['credentials', Credentials], ['web', WebServer], ['connection', Connection], ['typert', Typert], ['gateway', Gateway],
    ['sessions', SessionStore], ['persistence', Jsonl], ['storage', Storage], ['storage-json', StorageJson], ['storage-domain', StorageDomain],
    ['prompt', SystemPrompt], ['tools', Tools], ['agents', AgentRegistry], ['projections', SessionProjections], ['collaboration', Collaboration],
  ])
  const rows = [...modules.keys()].map(name => ({ name, ...(name === 'credentials' ? { config: { path: join(root, '.credentials.yaml'), watch: false } }
    : name === 'web' ? { config: { host: '127.0.0.1', port: 0 } }
      : name === 'persistence' ? { config: { root: join(root, 'sessions'), compression: 'none' } }
        : name === 'storage-json' ? { config: { root: join(root, 'storage') } }
          : name === 'storage-domain' ? { config: { backend: 'json' } }
            : name === 'collaboration' ? { config: { maxFramedMessageBytes: 16384, peerDiscussionTools: [], stateLimits: { maxStateBytes: 1000000, maxJournalEntries: 1000, maxRequests: 1000 } } } : {}) }))
  const config = join(root, 'cordis.yml')
  await writeFile(config, JSON.stringify(rows))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = {
    loadCache: new Map(),
    register(): never { throw new Error('Unexpected test loader registration') },
    getOrCreateModuleJob(): never { throw new Error('Unexpected test module job') },
    resolveSync(): never { throw new Error('Unexpected test module resolution') },
    load(): never { throw new Error('Unexpected test module load') },
    version: 'v2', async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unknown test plugin ${specifier}`)
      return modules.get(specifier)
    } }
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
  expect(ctx.get('collaborationStore')).toBeDefined()
  // This owner tests authenticated controls with metadata-only Session fixtures.
  await ctx.collaborationMailbox.close()
  for (const [id, meta] of [
    ['a', { cwd: root }], ['b', { cwd: join(root, 'other-worktree'), parentSession: SessionId('a') }],
    ['c', { cwd: root }], ['child', { cwd: root, origin: 'subagent' as const }],
    ['deep', { cwd: root, delegationDepth: 1 }], ['no-cwd', {}],
  ] as const) {
    const session = ctx.sessions.prepare(SessionId(id), { meta })
    const stored = await ctx.sessionPersistence.create(session.header)
    await stored.flush()
    await stored.close()
  }
  const origin = `http://127.0.0.1:${String(ctx.webServer.port)}`
  const target = new URL(ctx.connection.authenticatedUrl(origin))
  let cookie: string | undefined
  ctx.connection.authorizeIndex({ method: 'GET', url: target.pathname + target.search, headers: { host: target.host } }, {
    writeHead(_status, headers) { cookie = headers?.['set-cookie']?.split(';', 1)[0] }, end() {},
  })
  if (cookie === undefined) throw new Error('UI authentication did not yield a cookie')
  const authenticatedCookie = cookie
  const call = async (method: string, request: object, authenticated = true) => {
    const response = await fetch(`${origin}/api/collaboration/${method}`, { method: 'POST',
      headers: { 'content-type': 'application/json', ...(authenticated ? { cookie: authenticatedCookie } : {}) },
      body: JSON.stringify({ type: 'client-request', rpcId: method, method: `collaboration/${method}`, payload: { args: { request } } }),
    })
    const text = await response.text()
    return { status: response.status, result: response.status === 200 ? (JSON.parse(text) as { result: WireResult }).result : undefined }
  }
  const add = (requestId = 'add', expectedRevision = 0) => ({ sessionId: 'a', peerSessionId: 'b', title: 'A', peerTitle: 'B',
    cwd: root, peerCwd: join(root, 'other-worktree'), disclosureAccepted: true, grants: { snapshot: true, follow: true },
    activationLimit: 2, requestId, expectedRevision })
  const pair = (connectionId: string, expectedRevision: number, requestId: string) => ({ sessionId: 'a', connectionId, expectedRevision, requestId })
  const socket = async (sessionId: string, method = 'follow') => {
    const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/api/remote.mux`, { headers: { cookie: authenticatedCookie } })
    const closed = once(ws, 'close')
    cleanups.push(async () => { ws.close(); await closed })
    await once(ws, 'open')
    const frames: Array<{
      type: string
      value?: { revision: number; connections: readonly { id: string }[] }
      error?: { code: string }
    }> = []
    ws.on('message', (data) => {
      const text = Array.isArray(data) ? Buffer.concat(data).toString('utf8')
        : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : data.toString('utf8')
      frames.push(JSON.parse(text) as (typeof frames)[number])
    })
    ws.send(JSON.stringify({ type: 'open', streamId: 'follow', endpoint: `collaboration/${method}`, payload: { args: { request: { sessionId } } } }))
    await vi.waitFor(() => { expect(frames.length).toBeGreaterThan(0) })
    return { ws, frames }
  }
  return { ctx, root, call, add, pair, socket }
}

it.each([
  { snapshot: true, follow: false }, { snapshot: false, follow: true }, { snapshot: false, follow: false },
])('keeps human management snapshot and stream complete for pair grants %j, while peer views remain filtered', async (grants) => {
  const h = await load()
  await h.call('addPeer', { ...h.add(), grants })
  const pair = h.ctx.collaborationStore.read().connections[0]!
  const before = h.ctx.collaborationStore.read()
  await h.ctx.collaborationStore.transact(before.revision, state => applyDiscussionOperation(state, {
    kind: 'enqueue', message: { id: peerMessageIdSchema.parse('shared-message'), connectionId: pair.id,
      sender: SessionId('a'), recipient: SessionId('b'), text: 'explicitly shared', state: 'queued' },
  }, { actor: { kind: 'session', sessionId: SessionId('a') }, timestamp: new Date().toISOString() }))
  const control = await h.call('controlSnapshot', { sessionId: 'a' })
  expect(control.result).toMatchObject({ ok: true, value: { connections: [{ id: pair.id }], outbox: [{ text: 'explicitly shared' }] } })
  const stream = await h.socket('a', 'controlFollow')
  await vi.waitFor(() => { expect(stream.frames.find(frame => frame.type === 'item')?.value).toMatchObject({ connections: [{ id: pair.id }], outbox: [{ text: 'explicitly shared' }] }) })
  expect((await h.call('snapshot', { sessionId: 'a' })).result?.value?.connections).toHaveLength(grants.snapshot ? 1 : 0)
  const peerView = await h.socket('a')
  await vi.waitFor(() => { expect(peerView.frames.find(frame => frame.type === 'item')?.value?.connections).toHaveLength(grants.follow ? 1 : 0) })
  expect((await h.call('controlSnapshot', { sessionId: 'c' })).result?.value?.connections).toEqual([])
  expect((await h.call('controlSnapshot', { sessionId: 'a', controlProjection: true })).result?.error?.code).toBe('gateway/bad-request')
  expect((await h.call('controlSnapshot', { sessionId: 'a' }, false)).status).toBe(401)
  const revision = h.ctx.collaborationStore.read().revision
  await h.call('removePeer', h.pair(pair.id, revision, 'disconnect-ui'))
  await vi.waitFor(() => { expect(stream.frames.filter(frame => frame.type === 'item').at(-1)?.value?.connections).toEqual([]) })
  expect(h.ctx.agents.list()).toEqual([])
})

it('authenticated addPeer registers both ordinary sessions from headers without waking an Agent', async () => {
  const h = await load()
  const open = vi.spyOn(h.ctx.sessionPersistence, 'open')
  const result = await h.call('addPeer', h.add())
  expect(result.result).toMatchObject({ ok: true, value: { revision: 1 } })
  const state = h.ctx.collaborationStore.read()
  expect(state.registrations).toEqual([{ sessionId: 'a', title: 'A', cwd: h.root }, { sessionId: 'b', title: 'B', cwd: join(h.root, 'other-worktree') }])
  expect(state.connections).toHaveLength(1)
  expect(state.connections[0]).toMatchObject({ disclosureAccepted: true, budget: { limit: 2, used: 0 } })
  expect(h.ctx.agents.list()).toEqual([])
  expect(open).not.toHaveBeenCalled()
})

it.each(['addPeer', 'removePeer', 'pause', 'resume', 'budget'])('rejects unauthenticated model-origin %s even with JSON human flags', async (method) => {
  const h = await load()
  const request = method === 'addPeer' ? h.add() : h.pair('invented', 0, method)
  expect((await h.call(method, { ...request, human: true, admission: { scope: 'discussion' } }, false)).status).toBe(401)
  expect(h.ctx.collaborationStore.read().revision).toBe(0)
})

it('JSON admission and actor fields cannot grant authenticated mutation capability', async () => {
  const h = await load()
  expect((await h.call('addPeer', { ...h.add(), human: true, admission: { scope: 'discussion' }, actor: { kind: 'human', sessionId: 'a' } })).result)
    .toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
  expect(() => applyDiscussionOperation(h.ctx.collaborationStore.read(), { kind: 'register', registration: { sessionId: SessionId('a'), title: 'forged', cwd: h.root } }, {
    actor: { kind: 'human', sessionId: SessionId('a') }, timestamp: new Date().toISOString(), admission: { scope: 'discussion' } as never,
  })).toThrow('human control is required')
  expect(h.ctx.collaborationStore.read().revision).toBe(0)
})

it.each(['removePeer', 'pause', 'resume', 'budget'])('rejects forged capability fields on authenticated %s', async (method) => {
  const h = await load()
  const id = (await h.call('addPeer', h.add())).result!.value!.connectionId!
  expect((await h.call(method, { ...h.pair(id, 1, method), ...(method === 'budget' ? { limit: 3 } : {}), human: true })).result)
    .toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
  expect(h.ctx.collaborationStore.read().revision).toBe(1)
})

it.each([
  ['missing', 'collaboration/session-unavailable'], ['child', 'collaboration/session-unavailable'],
  ['deep', 'collaboration/session-unavailable'], ['no-cwd', 'collaboration/workspace-mismatch'],
])('rejects %s with stable identity or workspace diagnostics', async (peerSessionId, code) => {
  const h = await load()
  const result = (await h.call('addPeer', { ...h.add(), peerSessionId })).result
  expect(result).toMatchObject({ ok: false, error: { code } })
  expect(result?.error?.message).toMatch(/session|workspace/i)
  expect(h.ctx.collaborationStore.read().revision).toBe(0)
})

it('rejects stale cwd and omitted activation budgets before registering a pair', async () => {
  const h = await load()
  expect((await h.call('addPeer', { ...h.add(), peerCwd: h.root })).result).toMatchObject({ ok: false, error: { code: 'collaboration/workspace-mismatch' } })
  const { activationLimit: _limit, ...request } = h.add()
  expect((await h.call('addPeer', request)).result).toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
  expect(h.ctx.collaborationStore.read().revision).toBe(0)
})

it('returns original addPeer retries despite changed headers, while changed intent conflicts', async () => {
  const h = await load()
  const original = (await h.call('addPeer', h.add())).result
  expect(original?.ok).toBe(true)
  const stat = vi.spyOn(h.ctx.sessionPersistence, 'stat').mockResolvedValue(undefined)
  expect((await h.call('addPeer', h.add())).result).toEqual(original)
  expect(stat).not.toHaveBeenCalled()
  expect((await h.call('addPeer', { ...h.add(), peerTitle: 'changed' })).result).toMatchObject({ ok: false, error: { code: 'collaboration/request-conflict' } })
  stat.mockRestore()
  expect(h.ctx.collaborationStore.read().revision).toBe(1)
})

it('serializes concurrent identical retries and distinguishes other actors and stale revisions', async () => {
  const h = await load()
  const results = await Promise.all([h.call('addPeer', h.add()), h.call('addPeer', h.add())])
  expect(results[0].result?.ok).toBe(true)
  expect(results[1].result).toEqual(results[0].result)
  const id = results[0].result!.value!.connectionId!
  expect((await h.call('pause', { ...h.pair(id, 0, 'pause') })).result).toMatchObject({ ok: false, error: { code: 'collaboration/revision-conflict' } })
  expect((await h.call('pause', { ...h.pair(id, 1, 'pause'), sessionId: 'c' })).result).toMatchObject({ ok: false, error: { code: 'collaboration/unauthorized' } })
  expect(h.ctx.collaborationStore.read().revision).toBe(1)
})

it('authenticated pause/resume/budget/removal preserve retries and cancel queued work atomically', async () => {
  const h = await load()
  const id = (await h.call('addPeer', h.add())).result!.value!.connectionId!
  const paused = await h.call('pause', h.pair(id, 1, 'pause'))
  expect(paused.result).toMatchObject({ ok: true, value: { revision: 2 } })
  expect((await h.call('pause', h.pair(id, 1, 'pause'))).result).toEqual(paused.result)
  expect(h.ctx.collaborationStore.read().connections[0]?.paused).toBe(true)
  expect((await h.call('resume', h.pair(id, 2, 'resume'))).result).toMatchObject({ ok: true, value: { revision: 3 } })
  expect((await h.call('budget', { ...h.pair(id, 3, 'budget'), limit: 5 })).result).toMatchObject({ ok: true, value: { revision: 4 } })
  const transact = async (
    operation: Parameters<typeof applyDiscussionOperation>[1], actor: Parameters<typeof applyDiscussionOperation>[2]['actor'],
  ) => {
    await h.ctx.collaborationStore.transact(h.ctx.collaborationStore.read().revision,
      current => applyDiscussionOperation(current, operation, { actor, timestamp: new Date().toISOString() }))
  }
  for (const messageId of ['queued', 'admitted']) {
    await transact({ kind: 'enqueue', message: { id: peerMessageIdSchema.parse(messageId), connectionId: connectionIdSchema.parse(id), sender: SessionId('a'), recipient: SessionId('b'), text: messageId, state: 'queued' } }, { kind: 'session', sessionId: SessionId('a') })
    await transact({ kind: 'reserve-activation', messageId: peerMessageIdSchema.parse(messageId) }, { kind: 'system' })
  }
  await transact({ kind: 'admit', messageId: peerMessageIdSchema.parse('admitted') }, { kind: 'system' })
  const before = h.ctx.collaborationStore.read().revision
  const request = h.pair(id, before, 'remove')
  const removed = await h.call('removePeer', request)
  expect(removed.result).toMatchObject({ ok: true, value: { revision: before + 1 } })
  expect((await h.call('removePeer', request)).result).toEqual(removed.result)
  expect(h.ctx.collaborationStore.read().connections).toEqual([])
  expect(h.ctx.collaborationStore.read().outbox.map(row => [row.id, row.state])).toEqual([['queued', 'cancelled'], ['admitted', 'admitted']])
})

it('filters snapshots and streams to authorized pairs, sends full recovery baselines, and releases HMR registrations', async () => {
  const h = await load()
  const id = (await h.call('addPeer', h.add())).result!.value!.connectionId!
  expect((await h.call('snapshot', { sessionId: 'c' })).result?.value).toMatchObject({ registrations: [], connections: [], outbox: [] })
  expect((await h.call('snapshot', { sessionId: 'a' })).result?.value?.connections).toHaveLength(1)
  const stream = await h.socket('a')
  expect(stream.frames[0]).toMatchObject({ type: 'item', value: { revision: 1, connections: [{ id }] } })
  await h.call('pause', h.pair(id, 1, 'pause'))
  await vi.waitFor(() => { expect(stream.frames.some(frame => frame.type === 'item' && frame.value?.revision === 2)).toBe(true) })
  const reconnected = await h.socket('a')
  expect(reconnected.frames[0]).toMatchObject({ type: 'item', value: { revision: 2 } })
  const entry = [...h.ctx.loader.entries()].find(row => row.options.name === 'collaboration')!
  await entry.fiber!.dispose()
  await vi.waitFor(() => { expect(stream.frames.some(frame => frame.type === 'end')).toBe(true) })
  expect(h.ctx.get('collaborationRemote')).toBeUndefined()
  expect((await h.call('snapshot', { sessionId: 'a' })).status).toBe(404)
  await h.ctx.loader.create({ name: 'collaboration', config: {
    maxFramedMessageBytes: 16384, peerDiscussionTools: [],
    stateLimits: { maxStateBytes: 1000000, maxJournalEntries: 1000, maxRequests: 1000 },
  } })
  await h.ctx.loader.await()
  expect((await h.call('snapshot', { sessionId: 'a' })).result?.value).toMatchObject({ revision: 2, connections: [{ id, paused: true }] })
})

it('applies snapshot/follow grants separately and removes revoked pairs from an existing stream', async () => {
  const h = await load()
  const result = await h.call('addPeer', { ...h.add(), activationLimit: 0, grants: { snapshot: false, follow: true } })
  const id = result.result!.value!.connectionId!
  expect((await h.call('snapshot', { sessionId: 'a' })).result?.value).toMatchObject({ revision: 1, connections: [], registrations: [] })
  const stream = await h.socket('a')
  expect(stream.frames[0]?.value?.connections).toEqual([expect.objectContaining({ id })])
  await h.call('removePeer', h.pair(id, 1, 'remove'))
  await vi.waitFor(() => {
    expect(stream.frames.some(frame => frame.value?.revision === 2 && frame.value.connections.length === 0)).toBe(true)
  })
  const second = await h.call('addPeer', { ...h.add('new', 2), activationLimit: 0, grants: { snapshot: true, follow: false } })
  expect(second.result?.ok).toBe(true)
  await vi.waitFor(() => {
    expect(stream.frames.some(frame => frame.value?.revision === 3 && frame.value.connections.length === 0)).toBe(true)
  })
  expect((await h.call('snapshot', { sessionId: 'a' })).result?.value?.connections).toHaveLength(1)
})
