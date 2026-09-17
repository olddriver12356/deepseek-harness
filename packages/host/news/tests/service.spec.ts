import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import TimerService from '@deepseek-ai/cordis-plugin-timer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NewsService, type Config } from '../src/index.ts'
import { createTempArchive, removeTempArchives } from './support/archive-fixture.ts'
import { fetchPublic } from '../src/public-fetch.ts'
import { KnowledgeStore } from '@deepseek-ai/dsh-host-knowledge'
vi.mock('../src/public-fetch.ts', () => ({ fetchPublic: vi.fn() }))

const contexts: Context[] = []
const saveFeed = vi.fn(async () => {})
beforeEach(() => { saveFeed.mockReset(); saveFeed.mockResolvedValue(undefined); vi.spyOn(KnowledgeStore.prototype, 'saveFeed').mockImplementation(saveFeed) })

afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.allSettled(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await removeTempArchives()
})

describe('News service', () => {
  it('does not wait for a slow intake writer before returning the feed', async () => {
    const fixture = await createTempArchive()
    let release!: () => void
    saveFeed.mockImplementation(() => new Promise<void>((resolve) => { release = resolve }))
    vi.mocked(fetchPublic).mockImplementation(async () => ({ response: new Response('<rss><channel /></rss>', { headers: { 'content-type': 'application/rss+xml' } }) as never, close: async () => {} }))
    const ctx = new Context()
    contexts.push(ctx)
    new TimerService(ctx)
    ctx.provide('webServer', { register: () => () => {} } as never)
    const service = new NewsService(ctx, { cacheDir: fixture.cacheDir, vaultRoot: fixture.vaultRoot, refreshIntervalMs: 60_000 })
    try {
      expect((await service.list({ refresh: true })).fetchedAt).not.toBeNull()
      await expect.poll(() => saveFeed.mock.calls.length).toBe(1)
    } finally {
      release?.()
    }
  })
  it('serves and caches a crawl when Agent Layer is locked, then retries archival', async () => {
    const fixture = await createTempArchive()
    saveFeed.mockRejectedValue(new Error('Agent Layer writer lock is already held or requires recovery'))
    const xml = `<rss><channel><item><title>Available</title><link>https://example.com/available</link><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`
    vi.mocked(fetchPublic).mockImplementation(async () => ({ response: new Response(xml, { headers: { 'content-type': 'application/rss+xml' } }) as never, close: async () => {} }))
    const ctx = new Context()
    contexts.push(ctx)
    new TimerService(ctx)
    ctx.provide('webServer', { register: () => () => {} } as never)
    const service = new NewsService(ctx, { cacheDir: fixture.cacheDir, vaultRoot: fixture.vaultRoot, refreshIntervalMs: 60_000 })
    const snapshot = await service.list({ refresh: true })
    expect(snapshot.news[0]?.title).toBe('Available')
    expect(JSON.parse(await readFile(join(fixture.cacheDir, 'news.json'), 'utf8')).news[0].title).toBe('Available')
    await expect.poll(async () => (await readFile(fixture.archivePath, 'utf8').catch(() => ''))).toContain('Available')
    await expect.poll(() => saveFeed.mock.calls.length).toBe(1)
    saveFeed.mockResolvedValue(undefined)
    await service.list({ refresh: true })
    await expect.poll(() => saveFeed.mock.calls.length).toBe(2)
  })
  it('uses the schema default for the background refresh interval', async () => {
    const fixture = await createTempArchive()
    const interval = vi.spyOn(globalThis, 'setInterval')
    vi.mocked(fetchPublic).mockImplementation(async () => ({ response: new Response('<rss><channel /></rss>', { status: 200, headers: { 'content-type': 'application/rss+xml' } }) as never, close: async () => {} }))
    const ctx = new Context()
    contexts.push(ctx)
    new TimerService(ctx)
    ctx.provide('webServer', { register: () => () => {} } as never)

    // Omit the defaulted field deliberately to exercise configuration parsing.
    const config = NewsService.Config({
      cacheDir: fixture.cacheDir,
      vaultRoot: fixture.vaultRoot,
    } as Config)
    new NewsService(ctx, config)

    expect(interval).toHaveBeenCalledWith(expect.any(Function), 6 * 60 * 60 * 1000)
    await expect.poll(async () => {
      try {
        await readFile(join(fixture.cacheDir, 'news.json'), 'utf8')
        return true
      } catch {
        return false
      }
    }).toBe(true)
  })

  it('archives a background crawl without a browser Remote read', async () => {
    const fixture = await createTempArchive()
    const publishedAt = new Date().toUTCString()
    const xml = `<rss><channel><item><title>Stored</title><link>https://example.com/stored</link><pubDate>${publishedAt}</pubDate><enclosure type="image/jpeg" url="https://example.com/stored.jpg" /></item></channel></rss>`
    vi.mocked(fetchPublic).mockImplementation(async () => ({ response: new Response(xml, { status: 200, headers: { 'content-type': 'application/rss+xml' } }) as never, close: async () => {} }))
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
    await expect.poll(() => saveFeed.mock.calls.length).toBeGreaterThan(0)
    expect(saveFeed).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ title: 'Stored' })]))
    await expect(readFile(join(fixture.vaultRoot, 'Resources/AI News/news.jsonl'))).rejects.toThrow()
  })
})
