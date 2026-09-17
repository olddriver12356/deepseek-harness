import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { SkillFileStore } from '../../../packages/api/workspace-controller/src/skill-files.ts'
import type { SkillDeleteRequest, SkillFileRequest, SkillFileWriteRequest, SkillArtifactId } from '../../../packages/api/workspace-controller/src/types.ts'

it('edits real nested skill files in a browser and renders both panel backgrounds', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skills-browser-'))
  const skillRoot = join(root, '.agents/skills')
  await mkdir(join(skillRoot, 'summarize/references'), { recursive: true })
  await writeFile(join(skillRoot, 'summarize/SKILL.md'), '---\nname: summarize\ndescription: Produce a faithful summary of the supplied source.\nmetadata:\n  category: capture-and-ingest\n---\n# Procedure\n\n1. Read the source in full.\n2. Preserve the key facts and uncertainty.\n3. Return a concise summary with references.\n')
  await writeFile(join(skillRoot, 'summarize/references/example.md'), '# Example\nOriginal source')
  await mkdir(join(skillRoot, 'review-code'), { recursive: true })
  await writeFile(join(skillRoot, 'review-code/SKILL.md'), '---\nname: review-code\ndescription: Review correctness and maintenance costs.\nmetadata:\n  category: development\n---\nRead callers first.\n')
  const store = new SkillFileStore(async () => [{ path: skillRoot, source: 'project-agents', rank: 200 }])
  const server = await createServer({
    configFile: false, root: fileURLToPath(new URL('./fixtures/skills-panel', import.meta.url)),
    plugins: [tsconfigPaths({ projects: [fileURLToPath(new URL('../../../tsconfig.base.client.json', import.meta.url))] }), {
      name: 'skill-files-fixture',
      configureServer(server) { server.middlewares.use('/api', async (request, response) => {
        try {
          const chunks: Buffer[] = []
          for await (const chunk of request) chunks.push(Buffer.from(chunk))
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SkillFileRequest & SkillFileWriteRequest & SkillDeleteRequest
          const value = request.url === '/list' ? await store.inventory(root)
            : request.url === '/tree' ? await store.tree(root, payload.id as SkillArtifactId)
              : request.url === '/read' ? await store.read(root, payload) : request.url === '/remove' ? await store.remove(root, payload) : await store.write(root, payload)
          response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value))
        } catch (error) { response.statusCode = 400; response.end(JSON.stringify({ error: String(error) })) }
      }) },
    }],
    server: { host: '127.0.0.1', port: 0, fs: { allow: [fileURLToPath(new URL('../../..', import.meta.url))] } },
    logLevel: 'error',
  })
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    await server.listen()
    const page = await browser.newPage({ viewport: { width: 1500, height: 980 } })
    const failures: string[] = []
    page.on('pageerror', (error) => { failures.push(error.message); console.error(error.message) })
    page.on('console', (message) => { if (message.type() === 'error') console.error(message.text()) })
    page.on('response', (response) => { if (response.status() >= 400) console.error(response.status(), response.url()) })
    await page.goto(server.resolvedUrls!.local[0]!)
    await page.getByRole('button', { name: /^summarize/ }).click()
    await page.getByRole('heading', { name: 'Procedure', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Fields', exact: true }).click()
    await page.getByLabel('Name', { exact: true }).fill('summarize-sources')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor()
    expect(await readFile(join(skillRoot, 'summarize/SKILL.md'), 'utf8')).toContain('name: summarize-sources')
    await page.getByRole('button', { name: 'example.md', exact: true }).click()
    await page.getByRole('heading', { name: 'Example', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Source', exact: true }).click()
    await page.getByLabel('Source', { exact: true }).fill('# Example\nSaved through browser')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor()
    expect(await readFile(join(skillRoot, 'summarize/references/example.md'), 'utf8')).toContain('Saved through browser')
    await page.getByRole('button', { name: 'SKILL.md', exact: true }).click()
    const shots = process.env.DSH_SKILLS_SCREENSHOT_DIR
    if (shots !== undefined) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: join(shots, 'skills-desktop.png') }) }
    await page.getByRole('tab', { name: /Experts/ }).click()
    await page.getByText('Systems thinker', { exact: true }).waitFor()
    if (shots !== undefined) await page.screenshot({ path: join(shots, 'experts-desktop.png') })
    await page.getByRole('tab', { name: /Skills/ }).click()
    await page.setViewportSize({ width: 600, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    if (shots !== undefined) await page.screenshot({ path: join(shots, 'skills-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Delete summarize-sources', exact: true }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByText('Skill removed. Recovery location:', { exact: false }).waitFor()
    expect((await store.inventory(root)).skills.map(item => item.name)).toEqual(['review-code'])
    expect(failures).toEqual([])
  } finally {
    try { await browser?.close() } finally {
      try { await server.close() } finally { await rm(root, { recursive: true, force: true }) }
    }
  }
}, 60_000)
