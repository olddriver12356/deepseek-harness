/** Keyless shipped Web composition: source manuals and flat hook references never execute their targets. */
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { EntryTree } from '@deepseek-ai/cordis-plugin-loader'
import * as CodexHooks from '@deepseek-ai/dsh-hooks-codex'
import { startHttpMcpFixture } from '../../../packages/mcp/mcp-client/tests/http-fixture.ts'
import { launchWebScaffold, watchConsole, captureStableAria, compareOrRefreshGolden, webSnapshotMode } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, writeComposerDraft } from './support.ts'

it('reads source-owned references with keyboard filters at desktop and 390px without submitting model input', async () => {
  const scaffold = await launchWebScaffold({
    replayFixture: fileURLToPath(new URL('../../../snapshots/web/tool-reference/session.v5.jsonl', import.meta.url)),
    extraOverlayPath: fileURLToPath(new URL('../../../snapshots/web/tool-reference/cordis.yml', import.meta.url)),
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  const console = watchConsole(page)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await connectFreshWorkspace(page, scaffold.workspaceCwd)
  const settled = scaffold.whenTurnSettled()
  const input = page.locator('[data-composer-input]').first()
  await writeComposerDraft(page, input, 'Reply with the single word LIGHTHOUSE and stop.')
  await input.press('Enter')
  await settled
  await page.getByText('LIGHTHOUSE', { exact: true }).waitFor()
  const cold = scaffold.ctx.sessions.create()
  const coldEvents = cold.snapshotEvents()
  expect(scaffold.ctx.agents.get(cold.id)).toBeUndefined()
  expect(scaffold.ctx.pluginInventory.referenceList({ sessionId: cold.id, locale: 'en' }).sessionAvailability).toBe('not-live')
  expect(scaffold.ctx.agents.get(cold.id)).toBeUndefined()
  expect(cold.snapshotEvents()).toEqual(coldEvents)
  const external = await startHttpMcpFixture()
  onTestFinished(() => external.close())
  const mcp = await scaffold.ctx.loader.create({ name: '@deepseek-ai/dsh-mcp-client', config: {
    transport: 'streamable-http', serverName: 'reference-fixture', url: external.url,
    headers: { authorization: 'Bearer SECRET_REFERENCE_CREDENTIAL' }, failOnStartupError: true, reconnect: { enabled: false },
  } })
  onTestFinished(() => { scaffold.ctx.loader.remove(mcp) })
  await expect.poll(() => scaffold.ctx.pluginInventory.referenceList({ locale: 'en' }).mcp.items
    .some(item => item.name === 'reference-fixture' && 'state' in item && item.state === 'connected')).toBe(true)
  const live = scaffold.ctx.agents.list()[0]!
  const commands = scaffold.ctx.pluginInventory.referenceList({ sessionId: live.id, locale: 'en' }).commands
  expect(commands.length).toBeGreaterThan(0)
  for (const command of commands) {
    expect(command.hasReference, `/${command.name} has source-owned documentation`).toBe(true)
    expect(scaffold.ctx.pluginInventory.commandReference({ sessionId: live.id, name: command.name, locale: 'en' })).not.toBeNull()
    expect(scaffold.ctx.pluginInventory.commandReference({ sessionId: live.id, name: command.name, locale: 'zh' })).not.toBeNull()
  }
  const hookPath = join(scaffold.workspaceCwd, 'reference-hooks.json')
  await writeFile(hookPath, JSON.stringify({ PreToolUse: [{ hooks: [{ command: 'SECRET_NEVER_EXECUTE' }] }] }))
  const agent = live
  class HookOverlay extends EntryTree { override write(): void {} }
  const owner = agent.ctx.fiber.entry
  const previousTree = owner?.subtree
  const overlay = new HookOverlay(agent.ctx)
  if (owner !== undefined) {
    if (previousTree === undefined) delete owner.subtree
    else owner.subtree = previousTree
  }
  scaffold.ctx.loader.builtins.referenceHooks = CodexHooks
  const hook = await overlay.create({ name: 'cordis:referenceHooks', config: { configPath: hookPath } })
  onTestFinished(() => { overlay.root.remove(hook.split(':').at(-1)!) })
  await overlay.await()
  const hookEntry = [...overlay.entries()][0]!
  expect(hookEntry.fiber).toBeDefined()
  await expect.poll(() => scaffold.ctx.pluginInventory.referenceList({ sessionId: agent.id, locale: 'en' }).hooks.items.length).toBe(1)
  const requestsBefore = external.authorization.length
  const callsBefore = [...external.calls]
  const before = scaffold.ctx.agents.list().map(agent => ({ id: agent.id, events: agent.session.snapshotEvents() }))
  let modelRequests = 0
  const stopModel = scaffold.ctx.on('llm/stream', async function* (_options, next) {
    modelRequests++
    yield* next()
  })
  onTestFinished(() => { stopModel() })
  let addedEvents = 0
  const stop = scaffold.ctx.on('session/event', () => { addedEvents++ })
  onTestFinished(() => { stop() })
  await page.locator('[data-panel="skills"]').click()
  const panel = page.locator('[data-skills-panel]')
  await panel.locator('nav').getByRole('button', { name: 'Commands', exact: true }).click()
  await panel.getByRole('button', { name: /^\/goal/ }).click()
  await panel.getByRole('heading', { name: 'Purpose', exact: true }).waitFor()
  await panel.getByRole('heading', { name: 'Examples', exact: true }).waitFor()
  expect(await panel.getByRole('button', { name: 'Save', exact: true }).count()).toBe(0)
  await panel.locator('nav').getByRole('button', { name: 'Hooks', exact: true }).click()
  const filter = panel.getByRole('combobox', { name: 'Hook type' })
  await filter.focus()
  await filter.selectOption('tool')
  expect(await filter.inputValue()).toBe('tool')
  expect(await filter.getByRole('option').allTextContents()).toEqual(['All types', 'Session', 'Prompt', 'Tool', 'Turn completion', 'Subagent'])
  await panel.getByRole('button', { name: /PreToolUse/ }).click()
  await panel.getByRole('heading', { name: 'Last execution', exact: true }).waitFor()
  expect(await panel.textContent()).not.toContain('SECRET_NEVER_EXECUTE')
  await overlay.update(hook.split(':').at(-1)!, { disabled: true })
  await expect.poll(() => panel.getByRole('button', { name: /PreToolUse/ }).count()).toBe(0)
  const aria = await captureStableAria(page, '[data-skills-panel]', scaffold.workspaceCwd)
  await compareOrRefreshGolden(fileURLToPath(new URL('./expected/tool-reference/hooks.expected.md', import.meta.url)),
    aria.split('\n').filter(line => !line.includes('Observed at:')).join('\n'), webSnapshotMode())
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await panel.locator('nav').getByRole('button', { name: 'MCP', exact: true }).click()
  await panel.getByRole('button', { name: /^reference-fixture/ }).click()
  await panel.getByRole('button', { name: 'ping', exact: true }).click()
  await panel.getByText('Replies pong.', { exact: true }).waitFor()
  expect(await panel.getByText('Read-only reference. Browsing does not execute commands, tools or hooks.').count()).toBe(1)
  expect(external.authorization.length).toBe(requestsBefore)
  expect(external.calls).toEqual(callsBefore)
  expect(await panel.textContent()).not.toContain('SECRET_REFERENCE_CREDENTIAL')
  expect(addedEvents).toBe(0)
  expect(modelRequests).toBe(0)
  expect(scaffold.ctx.agents.list().map(agent => ({ id: agent.id, events: agent.session.snapshotEvents() }))).toEqual(before)
  expect(console.pageErrors).toEqual([])
})
