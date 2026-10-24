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
import * as CodexHooks from '../src/index.ts'
import PluginInventoryGateway from '@deepseek-ai/dsh-host-plugin-inventory'
import { parseCodexConfig } from '../src/config.ts'
import { registerReferences } from '../src/reference.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })

describe('Codex hook references', () => {
  it('publishes actual adapter handlers through Loader and removes them without hook execution', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-codex-reference-'))
    const ctx = new Context()
    contexts.push(ctx)
    try {
      await ctx.plugin(Loader)
      await ctx.plugin(PluginInventoryGateway)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(ShellService)
      provideWorkingDirectoryFixture(ctx)
      ctx.baseUrl = pathToFileURL(root).href + '/'
      ctx.loader.builtins.include = Include
      ctx.loader.builtins.hooks = CodexHooks
      const configPath = join(root, 'hooks.json')
      await writeFile(configPath, JSON.stringify({ Stop: [{ hooks: [{ command: 'SECRET_NEVER_EXECUTE' }] }] }))
      const path = join(root, 'cordis.yml')
      await writeFile(path, JSON.stringify([{ name: 'cordis:hooks', config: { configPath } }]))
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } })
      await ctx.loader.await()
      const items = ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items
      expect(items).toMatchObject([{ events: ['Stop'], types: ['turn-completion'] }])
      expect(JSON.stringify(ctx.pluginInventory.referenceDetail({ id: items[0]!.id, locale: 'en' }))).not.toContain('SECRET_')
      const entry = [...ctx.loader.entries()].find(item => item.options.name === 'cordis:hooks')!
      await ctx.loader.update(entry.id, { disabled: true })
      expect(ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('publishes only synchronous supported handlers, not skipped hooks or subagent events', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(Loader)
    await ctx.plugin(PluginInventoryGateway)
    const events = ['PreToolUse', 'PostToolUse', 'SessionStart', 'UserPromptSubmit', 'Stop', 'SubagentStart']
    const parsed = parseCodexConfig(Object.fromEntries(events.map(event => [event, [{ hooks: [
      { command: 'SECRET_COMMAND' }, { command: 'SECRET_ASYNC', async: true }, { type: 'prompt' },
    ] }]]))).config
    const fiber = await ctx.plugin({ apply(inner: Context) { registerReferences(inner, parsed) } })
    const items = ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items
    expect(items).toHaveLength(5)
    expect(items.map(item => 'types' in item ? item.types : [])).toEqual([['tool'], ['tool'], ['session'], ['prompt'], ['turn-completion']])
    const details = items.map(item => ctx.pluginInventory.referenceDetail({ id: item.id, locale: 'en' }))
    expect(details).toMatchObject(items.map(() => ({ adapter: 'codex', lastExecution: { kind: 'unavailable', reason: 'uncorrelated-history' } })))
    expect(JSON.stringify({ items, details })).not.toContain('SECRET_')
    expect(details[0]).toHaveProperty('limitations')
    await fiber.dispose()
    expect(ctx.pluginInventory.referenceList({ locale: 'en' }).hooks.items).toEqual([])
  })
})
