/** Browser admission and recovery against the actual opt-in shipped Web profile. */
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from 'playwright'
import { expect, it } from 'vitest'
import { runDiscussionFlow, type DiscussionSurface } from '../../../packages/host/collaboration/tests/discussion-flow.ts'
import { newEnglishPage } from './support.ts'

async function selectSession(page: Page, id: string): Promise<void> {
  for (const group of await page.locator('[role="treeitem"][aria-expanded="false"]').all()) await group.click()
  await page.getByRole('treeitem').filter({ hasText: id === 'ordinary-peer-a' ? 'Collaboration Alpha' : 'Collaboration Beta' }).last().click()
  await page.getByRole('region', { name: 'Peer connections' }).waitFor()
}

it('registers peers, renders attributed discussion and restores human controls after process restart', async (test) => {
  const browser = await chromium.launch({ timeout: test.task.timeout })
  test.onTestFinished(async () => { await browser.close() })
  const page = await newEnglishPage(browser)
  page.setDefaultTimeout(20000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  let firstOpen = true
  const open = async ({ url, rpc }: DiscussionSurface): Promise<void> => {
    if (firstOpen) {
      await rpc('session/rename', { sessionId: 'ordinary-peer-a', title: 'Collaboration Alpha' })
      await rpc('session/rename', { sessionId: 'ordinary-peer-b', title: 'Collaboration Beta' })
    }
    await page.goto(url)
    await page.getByRole('tree', { name: 'Sessions' }).waitFor()
    if (firstOpen) {
      const welcome = page.getByRole('dialog', { name: 'Internal Testing Notice' })
      await welcome.getByRole('button', { name: 'Continue', exact: true }).click()
      await welcome.waitFor({ state: 'detached' })
      firstOpen = false
    }
    await selectSession(page, 'ordinary-peer-a')
  }
  try {
    await runDiscussionFlow(test, {
      replayDirectory: fileURLToPath(new URL('../../../snapshots/session/collaboration-discussion/', import.meta.url)),
      async connect(surface) {
        await open(surface)
        await page.getByRole('button', { name: 'Add peer', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: 'Discussion connections' })
        await dialog.waitFor()
        await dialog.getByLabel('Peer session').selectOption('ordinary-peer-b')
        await dialog.getByLabel('Your display label').fill('Alpha')
        await dialog.getByLabel('Peer display label').fill('Beta')
        await dialog.getByLabel('Automatic activation limit', { exact: true }).fill('1')
        expect(await dialog.getByRole('button', { name: 'Connect', exact: true }).isDisabled()).toBe(true)
        await dialog.getByLabel('I accept this discussion disclosure').check()
        await dialog.getByLabel('Allow collaboration snapshots for this pair').check()
        await dialog.getByLabel('Allow live collaboration records for this pair').uncheck()
        await dialog.getByRole('button', { name: 'Connect', exact: true }).click()
        await dialog.getByRole('button', { name: 'Beta', exact: true }).click()
        await dialog.getByText('Connected', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
      },
      async pause() {
        await selectSession(page, 'ordinary-peer-b')
        await page.getByRole('button', { name: '1 tool call', exact: true }).click()
        await page.getByText('Peer agent message', { exact: true }).waitFor()
        expect(await page.getByText('Peer agent message', { exact: true }).count()).toBe(1)
        expect(await page.getByText('Private human conversation ordinary-peer-a', { exact: true }).count()).toBe(0)
        await selectSession(page, 'ordinary-peer-a')
        await page.getByRole('region', { name: 'Peer connections' }).getByRole('button', { name: /^Beta/ }).click()
        const dialog = page.getByRole('dialog', { name: 'Discussion connections' })
        await dialog.getByText('Delivered to inbox', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: 'Pause', exact: true }).click()
        await dialog.getByText('Paused', { exact: true }).waitFor()
        const evidence = fileURLToPath(new URL('../../../.superpowers/sdd/2026-10-01-independent-session-collaboration/', import.meta.url))
        await mkdir(evidence, { recursive: true })
        await page.screenshot({ path: `${evidence}/task-10-collaboration-browser.png`, fullPage: true })
      },
      async reopened(surface) {
        await open(surface)
        await page.getByRole('region', { name: 'Peer connections' }).getByRole('button', { name: /^Beta/ }).click()
        const dialog = page.getByRole('dialog', { name: 'Discussion connections' })
        await dialog.getByText('Paused', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: 'Resume', exact: true }).click()
        await dialog.getByText('Connected', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: 'Disconnect', exact: true }).click()
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
        await page.getByText('No authorized connections', { exact: true }).waitFor()
      },
    })
    expect(errors).toEqual([])
  } finally { await browser.close() }
}, 120000)
