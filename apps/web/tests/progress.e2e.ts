/** Keyless owner controls and narrow-layout coverage through the shipped Web composition. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import type {} from '@deepseek-ai/dsh-long-term-progress'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'

it('shows Session milestones and commits separate owner decisions without starting work', async () => {
  const scaffold = await launchWebScaffold({ extraOverlayPath: fileURLToPath(new URL('./goal-bar.overlay.yml', import.meta.url)) })
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser)
    const tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const input = page.locator('[data-composer-input]')
    await input.fill('/long-goal status')
    await expect.poll(() => input.getAttribute('contenteditable')).toBe('true')
    await input.press('Enter')
    await expect.poll(() => scaffold.ctx.agents.list().length, { timeout: 15_000 }).toBe(1)
    const toggle = page.getByRole('button', { name: /Live Signal/ })
    if (await toggle.count() > 0 && await toggle.first().getAttribute('aria-expanded') === 'false') await toggle.first().click()
    const section = page.getByRole('region', { name: 'Long-term progress' })
    await expect.poll(async () => {
      const visible = await section.getByText('No milestones yet').isVisible()
      if (!visible && tripwire.pageErrors.length > 0) throw new Error(JSON.stringify(tripwire.pageErrors))
      return visible
    }, { timeout: 15_000, message: 'Session progress section appears in Live Signal' }).toBe(true)
    await section.getByRole('button', { name: 'Edit milestones' }).click()
    await section.getByRole('textbox', { name: 'Milestone draft JSON' }).fill(JSON.stringify([{
      id: 'm1', title: 'Foundation with a deliberately long descriptive caption', caption: 'Durable progress without a second scheduler',
      exitCondition: 'Human verification', references: ['spec.md'], checkpoints: [{
        id: 'c1', outcome: 'Pass the focused acceptance checks', detail: 'Use existing tests', references: ['plan.md'],
      }],
    }]))
    await section.getByRole('button', { name: 'Save draft' }).click()
    await section.getByRole('button', { name: /Foundation with/ }).waitFor()
    expect(scaffold.ctx.agents.list()).toHaveLength(1)
    const agent = scaffold.ctx.agents.list()[0]!
    expect(scaffold.ctx.goals.get(agent)).toBeUndefined()
    await section.getByRole('button', { name: /Foundation with/ }).click()
    await section.getByRole('button', { name: 'Approve scope' }).click()
    await section.getByRole('button', { name: 'Start milestone' }).waitFor()
    expect(scaffold.ctx.longTermProgress.get(agent)?.release).toBeNull()
    const snapshot = await captureStableAria(page, '[aria-label="Long-term progress"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(join(fileURLToPath(new URL('./expected/progress', import.meta.url)), 'approved.expected.md'), snapshot, webSnapshotMode())
    await section.getByRole('button', { name: 'Start milestone' }).click()
    await section.getByRole('button', { name: 'Renew scope authorization' }).waitFor()
    expect(scaffold.ctx.goals.get(agent)).toBeUndefined()
    for (const theme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: theme })
      await expect.poll(() => page.locator('body').getAttribute('data-ds-dark-theme')).toBe(theme === 'dark' ? '' : null)
      expect(await section.isVisible()).toBe(true)
      expect(await section.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  } finally { await browser.close(); await scaffold.close() }
}, 120_000)
