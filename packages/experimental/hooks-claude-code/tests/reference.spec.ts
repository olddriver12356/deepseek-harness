import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import ShellService from '@deepseek-ai/dsh-shell'
import { provideWorkingDirectoryFixture } from '@deepseek-ai/dsh-agent-loop-testkit'
import * as ClaudeHooks from '../src/index.ts'
import PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import { parseClaudeCodeConfig } from '../src/config.ts'
import { registerReferences } from '../src/reference.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

async function harness() {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(Loader)
  await ctx.plugin(PluginInventoryGateway)
  return ctx
}

describe('Claude Code hook references', () => {
  it('loads actual adapter handlers through cordis.yml without running commands and removes them on unload', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-hook-reference-'))
    const ctx = await harness()
    try {
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(ShellService)
      provideWorkingDirectoryFixture(ctx)
      ctx.baseUrl = pathToFileURL(root).href + '/'
      ctx.loader.builtins.include = Include
      ctx.loader.builtins.hooks = ClaudeHooks
      const configPath = join(root, 'hooks.json')
      await writeFile(configPath, JSON.stringify({ PreToolUse: [{ hooks: [{ command: 'SECRET_NEVER_EXECUTE' }] }] }))
      const path = join(root, 'cordis.yml')
      await writeFile(path, JSON.stringify([{ name: 'cordis:hooks', config: { configPath } }]))
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
      await ctx.loader.await()
      expect(ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items).toMatchObject([{ events: ['PreToolUse'] }])
      const entry = [...ctx.loader.entries()].find(item => item.options.name === 'cordis:hooks')!
      await ctx.loader.update(entry.id, { disabled: true })
      expect(ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items).toEqual([])
      await writeFile(configPath, '{SECRET_INVALID_JSON')
      await ctx.loader.update(entry.id, { disabled: false })
      await ctx.loader.await()
      const unavailable = ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items
      expect(unavailable).toMatchObject([{ state: 'unavailable', code: 'REFERENCE_SOURCE_UNAVAILABLE' }])
      expect(JSON.stringify(unavailable)).not.toContain('SECRET_')
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps identical configured handlers distinct and never exposes their commands or invented last runs', async () => {
    const ctx = await harness()
    const parsed = parseClaudeCodeConfig({ PreToolUse: [{ matcher: 'read|edit', hooks: [
      { type: 'command', command: 'SECRET_COMMAND' }, { type: 'command', command: 'SECRET_COMMAND' },
      { type: 'prompt', prompt: 'SECRET_SKIPPED' },
    ] }], Unsupported: [{ hooks: [{ command: 'SECRET_UNSUPPORTED' }] }] }).config
    const fiber = await ctx.plugin({ apply(inner: Context) { registerReferences(inner, parsed) } })
    const items = ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items
    expect(items).toHaveLength(2)
    expect(new Set(items.map(item => item.id)).size).toBe(2)
    expect(items).toMatchObject([{ types: ['tool'], events: ['PreToolUse'], enabled: true }, { types: ['tool'] }])
    const details = items.map(item => ctx.pluginInventory.referenceDetail({ id: item.id, locale: 'en' }))
    expect(details).toMatchObject([{ adapter: 'claude-code', matcher: 'read|edit', lastExecution: { kind: 'unavailable', reason: 'uncorrelated-history' } }, { adapter: 'claude-code' }])
    expect(JSON.stringify({ items, details })).not.toContain('SECRET_')
    await fiber.dispose()
    expect(ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items).toEqual([])
  })

  it('maps all seven supported events to exact filter types and localizes trigger explanations', async () => {
    const ctx = await harness()
    const events = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStart', 'SubagentStop']
    const parsed = parseClaudeCodeConfig(Object.fromEntries(events.map(event => [event, [{ hooks: [{ command: 'never execute' }] }]]))).config
    await ctx.plugin({ apply(inner: Context) { registerReferences(inner, parsed) } })
    const items = ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items
    expect(items.map(item => 'types' in item ? item.types : [])).toEqual([['session'], ['prompt'], ['tool'], ['tool'], ['turn-completion'], ['subagent'], ['subagent']])
    const id = items[0]!.id
    const en = ctx.pluginInventory.referenceDetail({ id, locale: 'en' })
    const zh = ctx.pluginInventory.referenceDetail({ id, locale: 'zh' })
    expect(en).not.toEqual(zh)
    expect(en).toMatchObject({ lastExecution: { kind: 'unavailable' } })
  })
})
