import { readFile } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import TimerService from '@deepseek-ai/cordis-plugin-timer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NewsService, type Config } from '../src/index.ts'
import { createTempArchive, removeTempArchives } from './support/archive-fixture.ts'

const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await removeTempArchives()
})

describe('News service', () => {
  it('archives a background crawl without a browser Remote read', async () => {
    const fixture = await createTempArchive()
    const publishedAt = new Date().toUTCString()
    const xml = `<rss><channel><item><title>Stored</title><link>https://example.com/stored</link><pubDate>${publishedAt}</pubDate><enclosure type="image/jpeg" url="https://example.com/stored.jpg" /></item></channel></rss>`
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, { status: 200 })))
    const ctx = new Context()
    contexts.push(ctx)
    new TimerService(ctx)
    ctx.provide('webServer', { register: () => () => {} } as never)

    new NewsService(ctx, {
      cacheDir: fixture.cacheDir,
      vaultRoot: fixture.vaultRoot,
      refreshIntervalMs: 60_000,
    } satisfies Config)

    await expect.poll(async () => {
      try {
        return (await readFile(fixture.archivePath, 'utf8')).trim().split('\n').length
      } catch {
        return 0
      }
    }).toBe(2)
  })
})
