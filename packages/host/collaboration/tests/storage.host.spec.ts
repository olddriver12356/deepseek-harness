import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Storage from '@deepseek-ai/dsh-storage'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import * as StorageJson from '@deepseek-ai/dsh-storage-json'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import { createHumanControlAdmission } from '../src/authority.ts'
import { applyDiscussionOperation, findRequestReceipt } from '../src/state.ts'
import { discussionOperationSchema, requestIdSchema } from '../src/schema.ts'
import * as collaboration from '../src/index.ts'
import { CollaborationStore } from '../src/store.ts'
import { SessionId } from '@deepseek-ai/dsh-session'

const limits = { maxStateBytes: 100000, maxJournalEntries: 100, maxRequests: 100 }
const contexts: Context[] = []
const paths: string[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(paths.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
async function open(pool = new MemoryMediaPool(), capacity = limits) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory' })
  const store = await CollaborationStore.open(facility, capacity)
  ctx.effect(() => () => store.close())
  const changed: unknown[] = []
  ctx.on('domain/changed', (change) => { changed.push(change) })
  return { store, pool, changed }
}
const host = { actor: { kind: 'human' as const, sessionId: SessionId('a') }, timestamp: '2026-10-02T12:00:00.000Z', admission: createHumanControlAdmission('discussion') }
const register = (state: ReturnType<CollaborationStore['read']>) => applyDiscussionOperation(state, { kind: 'register', registration: { sessionId: SessionId('a'), title: 'A', cwd: '/a' } }, host)

async function bootJson(root: string) {
  const ctx = new Context()
  contexts.push(ctx)
  const modules = new Map<string, unknown>([
    ['storage', Storage], ['json', StorageJson], ['domain', StorageDomain],
    ['prompt', SystemPrompt], ['tools', ToolRuntime], ['agents', AgentRegistry], ['sessions', SessionStore],
    ['projections', SessionProjections], ['persistence', Jsonl], ['collaboration', collaboration],
  ])
  const rows = [
    { name: 'storage' }, { name: 'json', config: { root } }, { name: 'domain', config: { backend: 'json' } },
    { name: 'prompt' }, { name: 'tools' }, { name: 'agents' }, { name: 'sessions' }, { name: 'projections' },
    { name: 'persistence', config: { root: join(root, 'sessions'), compression: 'none' } },
    { name: 'collaboration', config: { maxFramedMessageBytes: 16384, stateLimits: limits } },
  ]
  const config = join(root, 'cordis.yml')
  await writeFile(config, JSON.stringify(rows))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(name: string) {
    if (!modules.has(name)) throw new Error(`unknown fixture ${name}`)
    return modules.get(name)
  } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
  // This owner tests aggregate persistence with no recipient runtime or resolver.
  await ctx.collaborationMailbox.close()
  return { ctx, store: ctx.collaborationStore }
}

function aggregateBytes(state: ReturnType<CollaborationStore['read']>) {
  return Buffer.byteLength(JSON.stringify({ unit: { name: 'collaboration', version: 1 }, global: null, tables: { state: { current: state } } }, null, 2) + '\n')
}

describe('atomic collaboration store', () => {
  it('initializes current and serializes simultaneous revision attempts', async () => {
    const { store } = await open()
    expect(store.read().revision).toBe(0)
    const outcomes = await Promise.allSettled([store.transact(0, register), store.transact(0, register)])
    expect(outcomes.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(outcomes[1]).toMatchObject({ reason: { code: 'collaboration/revision-conflict', details: { revision: 1 } } })
    expect(store.read().journal).toHaveLength(1)
  })

  it('does not change memory, journal or notifications when durable writing fails', async () => {
    const { store, pool, changed } = await open()
    const before = store.read()
    pool.failNextWrites = 1
    await expect(store.transact(0, register)).rejects.toThrow('injected write failure')
    expect(store.read()).toEqual(before)
    expect(changed).toEqual([])
    await store.transact(0, register)
    expect(changed).toHaveLength(1)
  })

  it('fails capacity visibly without discarding authority facts', async () => {
    const { store } = await open(undefined, { ...limits, maxJournalEntries: 1 })
    await store.transact(0, register)
    await expect(store.transact(1, register)).rejects.toMatchObject({ code: 'collaboration/capacity' })
    expect(store.read().revision).toBe(1)
  })

  it('rejects newly admitted writes during disposal and drains the admitted write', async () => {
    const { store } = await open()
    const write = store.transact(0, register)
    const close = store.close()
    await expect(store.transact(0, register)).rejects.toThrow(/closed/)
    await expect(write).resolves.toMatchObject({ revision: 1 })
    await close
    expect(() => store.read()).toThrow(/closed/)
  })

  it.each([0, 2])('refuses unknown domain version %s', async (version) => {
    const pool = new MemoryMediaPool()
    pool.versions.set('collaboration', version)
    await expect(open(pool)).rejects.toMatchObject({ code: 'version-mismatch' })
  })

  it('refuses an entire corrupt authoritative record instead of skipping it', async () => {
    const first = await open()
    await first.store.close()
    first.pool.media.get('collaboration')!.tables.get('state')!.set('current', { revision: 0 })
    await expect(open(first.pool)).rejects.toMatchObject({ code: 'invalid-record' })
  })

  it('validates explicit capacity fields and applies UTF-8 bytes to the complete retained document', async () => {
    await expect(open(undefined, { ...limits, maxRequests: 0 })).rejects.toThrow()
    const first = await open()
    const multibyte = (state: ReturnType<CollaborationStore['read']>) => applyDiscussionOperation(state, { kind: 'register', registration: { sessionId: SessionId('a'), title: '你好', cwd: '/a' } }, host)
    const next = multibyte(first.store.read())
    const exact = aggregateBytes(next)
    const allowed = await open(undefined, { ...limits, maxStateBytes: exact })
    await expect(allowed.store.transact(0, multibyte)).resolves.toEqual(next)
    const denied = await open(undefined, { ...limits, maxStateBytes: exact - 1 })
    await expect(denied.store.transact(0, multibyte)).rejects.toMatchObject({ code: 'collaboration/capacity', details: { limit: 'maxStateBytes', actual: exact } })
    expect(denied.store.read().revision).toBe(0)
  })

  it('retains actor-scoped original receipts across concurrent duplicate retries', async () => {
    const { store } = await open(undefined, { ...limits, maxRequests: 1 })
    const requestId = requestIdSchema.parse('same-key')
    const operation = discussionOperationSchema.parse({ kind: 'register', registration: { sessionId: 'a', title: 'A', cwd: '/a' } })
    const mutate = (state: ReturnType<CollaborationStore['read']>) => applyDiscussionOperation(state, operation, { ...host, requestId })
    const outcomes = await Promise.allSettled([store.transact(0, mutate), store.transact(0, mutate)])
    expect(outcomes.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
    expect(findRequestReceipt(store.read(), host.actor, requestId, operation)?.result.revision).toBe(1)
    expect(store.read().journal).toHaveLength(1)
    const second = (state: ReturnType<CollaborationStore['read']>) => applyDiscussionOperation(state, operation, { ...host, requestId: requestIdSchema.parse('other') })
    await expect(store.transact(1, second)).rejects.toMatchObject({ code: 'collaboration/capacity', details: { limit: 'maxRequests' } })
    expect(store.read().revision).toBe(1)
  })

  it('releases the open domain after initial write failure or restored-capacity failure', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Storage)
    const pool = new MemoryMediaPool()
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory' })
    pool.failNextWrites = 1
    await expect(CollaborationStore.open(facility, limits)).rejects.toThrow('injected write failure')
    const store = await CollaborationStore.open(facility, limits)
    await store.transact(0, register)
    await store.close()
    await expect(CollaborationStore.open(facility, { ...limits, maxStateBytes: 1 })).rejects.toMatchObject({ code: 'collaboration/capacity' })
    await (await CollaborationStore.open(facility, limits)).close()
  })

  it('Loader and actual JSON backend persist pair grants, queued reservations and retry receipts through restart and HMR', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-collaboration-state-'))
    paths.push(root)
    const first = await bootJson(root)
    await first.store.transact(0, register)
    const op = (value: unknown) => discussionOperationSchema.parse(value)
    await first.store.transact(1, state => applyDiscussionOperation(state, op({ kind: 'add-peer', registrations: [{ sessionId: 'a', title: 'A', cwd: '/a' }, { sessionId: 'b', title: 'B', cwd: '/b' }], connection: { id: 'ab', sessions: ['a', 'b'], disclosureAccepted: true, grants: { snapshot: true, follow: false }, paused: false, budget: { limit: 1, used: 0 } } }), { ...host, requestId: requestIdSchema.parse('add-b') }))
    await first.store.transact(2, state => applyDiscussionOperation(state, op({ kind: 'enqueue', message: { id: 'm', connectionId: 'ab', sender: 'a', recipient: 'b', text: '你好', state: 'queued' } }), { actor: { kind: 'session', sessionId: SessionId('a') }, timestamp: host.timestamp, requestId: requestIdSchema.parse('send-m') }))
    await first.store.transact(3, state => applyDiscussionOperation(state, op({ kind: 'reserve-activation', messageId: 'm' }), { actor: { kind: 'system' }, timestamp: host.timestamp }))
    const snapshot = first.store.read()
    expect((JSON.parse(await readFile(join(root, 'collaboration.json'), 'utf8')) as { tables: { state: { current: unknown } } }).tables.state.current).toEqual(snapshot)
    await first.ctx.fiber.dispose()
    const second = await bootJson(root)
    expect(second.store.read()).toEqual(snapshot)
    expect(second.store.read().connections[0]?.budget).toEqual({ limit: 1, used: 1 })
    expect(findRequestReceipt(second.store.read(), { kind: 'session', sessionId: SessionId('a') }, requestIdSchema.parse('send-m'))?.result).toEqual({ revision: 3, messageId: 'm' })
    const entry = [...second.ctx.loader.entries()].find(row => row.options.name === 'collaboration')!
    await entry.fiber!.dispose()
    expect(second.ctx.get('collaborationStore')).toBeUndefined()
    await expect(second.store.transact(4, register)).rejects.toMatchObject({ code: 'collaboration/closed' })
    await second.ctx.loader.create({ name: 'collaboration', config: { maxFramedMessageBytes: 16384, stateLimits: limits } })
    await second.ctx.loader.await()
    expect(second.ctx.collaborationStore.read()).toEqual(snapshot)
  })

  it('rejects an unexplained transaction authority change before durable commit or notification', async () => {
    const { store, changed } = await open()
    const op = discussionOperationSchema.parse({ kind: 'add-peer', registrations: [
      { sessionId: 'a', title: 'A', cwd: '/a' }, { sessionId: 'b', title: 'B', cwd: '/b' },
    ], connection: { id: 'ab', sessions: ['a', 'b'], disclosureAccepted: true,
      grants: { snapshot: false, follow: false }, paused: true, budget: { limit: 1, used: 0 } } })
    await store.transact(0, state => applyDiscussionOperation(state, op, host))
    const before = store.read()
    await expect(store.transact(1, (state) => {
      const next = register(state)
      return { ...next, connections: next.connections.map(row => ({ ...row, grants: { snapshot: true, follow: true }, paused: false })) }
    })).rejects.toThrow(/journal/)
    expect(store.read()).toEqual(before)
    expect(changed).toHaveLength(1)
  })

  it.each(['contradictory-pair', 'revision-zero'] as const)('refuses stored authority inconsistent with journal: %s', async (corruption) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-collaboration-corrupt-'))
    paths.push(root)
    const { store, ctx } = await bootJson(root)
    const op = discussionOperationSchema.parse({ kind: 'add-peer', registrations: [
      { sessionId: 'a', title: 'A', cwd: '/a' }, { sessionId: 'b', title: 'B', cwd: '/b' },
    ], connection: { id: 'ab', sessions: ['a', 'b'], disclosureAccepted: true,
      grants: { snapshot: false, follow: false }, paused: true, budget: { limit: 1, used: 0 } } })
    await store.transact(0, state => applyDiscussionOperation(state, op, host))
    const valid = store.read()
    await store.close()
    const corrupt = corruption === 'revision-zero' ? { ...valid, revision: 0, journal: [] }
      : { ...valid, connections: valid.connections.map(row => ({ ...row, grants: { snapshot: true, follow: true }, paused: false })) }
    const path = join(root, 'collaboration.json')
    const document = JSON.parse(await readFile(path, 'utf8')) as { tables: { state: { current: unknown } } }
    document.tables.state.current = corrupt
    await writeFile(path, JSON.stringify(document, null, 2) + '\n')
    const outcome = await CollaborationStore.open(ctx.storageDomain, limits)
      .then(() => 'opened', (error: unknown) => (error as { code: string }).code)
    expect(outcome).toBe('invalid-record')
  })
})
