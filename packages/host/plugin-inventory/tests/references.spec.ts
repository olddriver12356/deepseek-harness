import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { createScope, type Scope } from '@deepseek-ai/dsh-scope'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginInventoryGateway from '../src/index.ts'
import { ReferenceRegistry } from '../src/references.ts'

const contexts: Context[] = []
const roots: string[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function harness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  await ctx.plugin(SessionStore)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(PluginInventoryGateway)
  return ctx
}

async function liveAgent(ctx: Context, name: string): Promise<{ agent: Agent; scope: Scope }> {
  const session = ctx.sessions.create(SessionId(name))
  // Reference reads require only the real registry identity and Session, never an Agent driver.
  const agent = { id: session.id, session } as Agent
  let scope!: Scope
  await ctx.plugin(Object.assign((inner: Context) => { scope = createScope(inner, agent) }, { inject: ['pluginInventory'] }))
  await ctx.agents.register(agent)
  return { agent, scope }
}

function server(name: string) {
  return {
    kind: 'mcp' as const,
    moduleName: '@deepseek-ai/dsh-mcp-client',
    summary: () => ({ name, description: '', documentation: 'partial' as const, state: 'connected' as const }),
    detail: () => ({ transport: 'stdio' as const, instructions: '', toolsAvailability: 'current' as const, tools: [] }),
  }
}

describe('Tool reference inventory', () => {
  it('checks aggregate scope access before invoking any source summary', async () => {
    const ctx = await harness()
    const registry = new ReferenceRegistry()
    let reads = 0
    registry.register(ctx, { ...server('restricted'), summary: () => { reads++; return server('restricted').summary() } })
    expect(registry.list(undefined, undefined, 'en', () => false)).toEqual([])
    expect(reads).toBe(0)
  })
  it('loads contributions from cordis.yml and removes them when the configured source unloads', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-reference-loader-'))
    roots.push(root)
    const configPath = join(root, 'cordis.yml')
    writeFileSync(configPath, JSON.stringify([
      { id: 'inventory', name: 'cordis:inventory' },
      { id: 'source', name: 'cordis:reference-source' },
    ]))
    const ctx = new Context()
    contexts.push(ctx)
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    ctx.loader.builtins.inventory = PluginInventoryGateway
    ctx.loader.builtins['reference-source'] = {
      inject: ['pluginInventory'],
      apply(inner: Context) { inner.pluginInventory.registerReference(server('from-config')) },
    }
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
    await ctx.loader.await()
    expect((ctx.pluginInventory.referenceList({ locale: 'en' })).mcp.items.map(item => item.name)).toEqual(['from-config'])
    const entry = [...ctx.loader.entries()].find(item => item.options.name === 'cordis:reference-source')!
    await ctx.loader.update(entry.id, { disabled: true })
    expect((ctx.pluginInventory.referenceList({ locale: 'en' })).mcp.items).toEqual([])
  })

  it('declares Session resource readers without requiring Agent materialization', async () => {
    const ctx = await harness()
    for (const method of ['referenceList', 'referenceDetail', 'commandReference']) {
      const marker = remoteMethods(ctx.pluginInventory).find(item => item.method === method)
      expect(marker?.resources).toHaveProperty('session')
      const reader = marker!.resources!.session!
      expect(reader({ sessionId: SessionId('protected'), locale: 'en' })).toBe('protected')
      expect(reader({ locale: 'en' })).toBeUndefined()
    }
  })

  it('limits a selected live Agent to its own and Host contributions without changing history', async () => {
    const ctx = await harness()
    const a = await liveAgent(ctx, 'a')
    const b = await liveAgent(ctx, 'b')
    ctx.pluginInventory.registerReference(server('host'))
    a.scope.ctx.pluginInventory.registerReference(server('only-a'))
    b.scope.ctx.pluginInventory.registerReference(server('only-b'))
    ctx.commands.register({ name: 'inspect', description: 'Inspect', handler: () => ({ kind: 'success' }) })
    const before = a.agent.session.snapshotEvents()
    const result = ctx.pluginInventory.referenceList({ sessionId: a.agent.id, locale: 'en' })
    expect(result.sessionAvailability).toBe('live')
    expect(result.mcp.items.map(item => item.name)).toEqual(['host', 'only-a'])
    expect(result.commands.map(item => item.name)).toEqual(['inspect'])
    expect(a.agent.session.snapshotEvents()).toEqual(before)
    const host = ctx.pluginInventory.referenceList({ locale: 'en' })
    expect(host.mcp.items.map(item => item.name)).toEqual(['host'])
    expect(host.sessionAvailability).toBe('not-selected')
  })

  it('supports a Host-only composition without Agent or command services', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    await ctx.plugin(PluginInventoryGateway)
    ctx.pluginInventory.registerReference(server('host-only'))
    const result = ctx.pluginInventory.referenceList({ sessionId: SessionId('not-mounted'), locale: 'en' })
    expect(result.sessionAvailability).toBe('not-live')
    expect(result.commands).toEqual([])
    expect(result.mcp.items.map(item => item.name)).toEqual(['host-only'])
  })

  it('returns no command manual for a cold Session without resuming its Agent', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('cold-manual'))
    expect(ctx.pluginInventory.commandReference({ sessionId: session.id, name: 'inspect', locale: 'en' })).toBeNull()
    expect(ctx.agents.get(session.id)).toBeUndefined()
  })

  it('reads a cold Session without creating an Agent or its scoped references', async () => {
    const ctx = await harness()
    const session = ctx.sessions.create(SessionId('cold'))
    const before = session.snapshotEvents()
    const result = ctx.pluginInventory.referenceList({ sessionId: session.id, locale: 'en' })
    expect(result.sessionAvailability).toBe('not-live')
    expect(result.commands).toEqual([])
    expect(ctx.agents.get(session.id)).toBeUndefined()
    expect(session.snapshotEvents()).toEqual(before)
  })

  it('does not invoke an out-of-scope or disposed detail callback', async () => {
    const ctx = await harness()
    const a = await liveAgent(ctx, 'a')
    const b = await liveAgent(ctx, 'b')
    let detailReads = 0
    a.scope.ctx.pluginInventory.registerReference({ ...server('private-a'), detail: () => { detailReads++; return server('a').detail() } })
    const listed = ctx.pluginInventory.referenceList({ sessionId: a.agent.id, locale: 'en' })
    const id = listed.mcp.items[0]!.id
    expect(ctx.pluginInventory.referenceDetail({ id, sessionId: b.agent.id, locale: 'en' })).toBeNull()
    expect(detailReads).toBe(0)
    expect(ctx.pluginInventory.referenceDetail({ id, sessionId: a.agent.id, locale: 'en' })).toMatchObject({ name: 'private-a', tools: [] })
    expect(detailReads).toBe(1)
    await a.scope.dispose()
    expect(ctx.pluginInventory.referenceDetail({ id, sessionId: a.agent.id, locale: 'en' })).toBeNull()
    expect(detailReads).toBe(1)
  })

  it('contains a failing provider and excludes extra configuration fields from wire results', async () => {
    const ctx = await harness()
    ctx.pluginInventory.registerReference({ ...server('broken'), summary: () => { throw new Error('SECRET_config') } })
    ctx.pluginInventory.registerReference({
      ...server('usable'),
      summary: () => ({ ...server('usable').summary(), config: { env: 'SECRET_env' } }),
      detail: () => ({ ...server('usable').detail(), command: 'SECRET_command', headers: { auth: 'SECRET_header' } }),
    })
    const result = ctx.pluginInventory.referenceList({ locale: 'en' })
    expect(result.mcp.items).toHaveLength(2)
    expect(result.mcp.items.find(item => item.name === 'usable')).toBeDefined()
    const id = result.mcp.items.find(item => item.name === 'usable')!.id
    const detail = ctx.pluginInventory.referenceDetail({ id, locale: 'en' })
    expect(JSON.stringify({ result, detail })).not.toContain('SECRET_')
    expect(result.mcp.items.find(item => 'state' in item && item.state === 'unavailable')).toBeDefined()
  })

  it('reads selected detail without consulting unrelated providers', async () => {
    const ctx = await harness()
    let otherReads = 0
    ctx.pluginInventory.registerReference(server('selected'))
    ctx.pluginInventory.registerReference({ ...server('other'), summary: () => { otherReads++; return server('other').summary() } })
    const listed = ctx.pluginInventory.referenceList({ locale: 'en' })
    const id = listed.mcp.items.find(item => item.name === 'selected')!.id
    otherReads = 0
    ctx.pluginInventory.referenceDetail({ id, locale: 'en' })
    expect(otherReads).toBe(0)
  })

  it('unsubscribes change listeners and ignores callbacks retained after source disposal', async () => {
    const ctx = await harness()
    let notify = () => {}
    let unsubscribed = false
    let notifications = 0
    ctx.on('plugin-inventory/references-changed', () => { notifications++ })
    const remove = ctx.pluginInventory.registerReference({
      ...server('live'),
      subscribeChanged(listener) { notify = listener; return () => { unsubscribed = true } },
    })
    const registered = notifications
    notify()
    expect(notifications).toBe(registered + 1)
    remove()
    expect(unsubscribed).toBe(true)
    const removed = notifications
    notify()
    expect(notifications).toBe(removed)
    expect((ctx.pluginInventory.referenceList({ locale: 'en' })).mcp.items).toEqual([])
  })
})
