/** Host News Remote: cached public RSS feeds and a closed image proxy. */

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-timer'
import z from '@deepseek-ai/schemastery'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { appendNewsArchive, type NewsArchiveBatch } from './archive.ts'
import { fetchPublic } from './public-fetch.ts'
import { KnowledgeStore } from '@deepseek-ai/dsh-host-knowledge'
import { collectFeed, imageCacheKey, NEWS_IMAGE_LIMIT, NEWS_SOURCES, readResponse, TOOLS_SOURCES, type CachedNewsItem } from './feed.ts'
import type { NewsListRequest, NewsItem, NewsSnapshot } from './types.ts'

export type * from './types.ts'

const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000

/** Host configuration for the local News cache. */
export interface Config {
  /** Absolute or cwd-relative directory holding the feed and thumbnail cache. */
  readonly cacheDir: string
  /** Root of the Obsidian Vault that receives the append-only News archive. */
  readonly vaultRoot: string
  /** Background feed refresh cadence in milliseconds. */
  readonly refreshIntervalMs: number
}

export const Config: z<Config> = z.object({
  cacheDir: z.string().required(),
  vaultRoot: z.string().required(),
  refreshIntervalMs: z.number().step(1).min(60_000).default(CACHE_MAX_AGE_MS),
})

const CACHE_SCHEMA = 1
const THUMB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const IMAGE_TIMEOUT_MS = 18_000
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])
const IMAGE_MIME: Record<string, string> = {
  '.avif': 'image/avif', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
}

interface StoredNewsCache {
  readonly schema: number
  readonly fetchedAt: string
  readonly news: readonly CachedNewsItem[]
  readonly tools: readonly CachedNewsItem[]
}

function isCachedItem(value: unknown): value is CachedNewsItem {
  if (value === null || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return typeof item.title === 'string' && typeof item.url === 'string' && typeof item.source === 'string'
    && (item.publishedAt === null || typeof item.publishedAt === 'string')
    && typeof item.summary === 'string' && (item.sourceImageUrl === null || typeof item.sourceImageUrl === 'string')
}

function isStoredCache(value: unknown): value is StoredNewsCache {
  if (value === null || typeof value !== 'object') return false
  const cache = value as Record<string, unknown>
  return cache.schema === CACHE_SCHEMA && typeof cache.fetchedAt === 'string'
    && Number.isFinite(Date.parse(cache.fetchedAt))
    && Array.isArray(cache.news) && cache.news.every(isCachedItem)
    && Array.isArray(cache.tools) && cache.tools.every(isCachedItem)
}

function proxyUrl(item: CachedNewsItem): string | null {
  if (item.sourceImageUrl === null) return null
  const params = new URLSearchParams({ url: item.sourceImageUrl, article: item.url })
  return `/news/image?${params.toString()}`
}

function publicItem(item: CachedNewsItem): NewsItem {
  return {
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    summary: item.summary,
    imageUrl: proxyUrl(item),
  }
}

function publicSnapshot(cache: StoredNewsCache | undefined): NewsSnapshot {
  if (cache === undefined) return { fetchedAt: null, news: [], tools: [] }
  return {
    fetchedAt: cache.fetchedAt,
    news: cache.news.map(publicItem),
    tools: cache.tools.map(publicItem),
  }
}

async function readCache(path: string): Promise<StoredNewsCache | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isStoredCache(parsed) ? parsed : undefined
  } catch {
    // A missing or malformed local cache is equivalent to a cold cache.
    return undefined
  }
}

async function writeCache(path: string, cache: StoredNewsCache): Promise<void> {
  await mkdir(resolve(path, '..'), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, JSON.stringify(cache), 'utf8')
  await rename(temporary, path)
}

function sourceCache(news: readonly CachedNewsItem[], tools: readonly CachedNewsItem[], fetchedAt: string): StoredNewsCache {
  return { schema: CACHE_SCHEMA, fetchedAt, news, tools }
}

interface CrawlResult {
  readonly archive: NewsArchiveBatch
  readonly cache: StoredNewsCache
}

async function crawl(): Promise<CrawlResult> {
  const fetchedAt = new Date().toISOString()
  const [news, tools] = await Promise.all([
    collectFeed(NEWS_SOURCES, Date.now()),
    collectFeed(TOOLS_SOURCES, Date.now()),
  ])
  return {
    archive: { news: news.archive, tools: tools.archive },
    cache: sourceCache(news.visible, tools.visible, fetchedAt),
  }
}

function isFresh(cache: StoredNewsCache | undefined): boolean {
  return cache !== undefined && Date.now() - Date.parse(cache.fetchedAt) < CACHE_MAX_AGE_MS
}

function requestUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function contentTypeFor(path: string): string {
  return IMAGE_MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
}

async function imageResponse(url: string, article: string, directory: string): Promise<{ body: Uint8Array; type: string }> {
  const imageUrl = requestUrl(url)
  const articleUrl = requestUrl(article)
  if (imageUrl === null || articleUrl === null) throw new Error('news: invalid image pair')
  const key = imageCacheKey(imageUrl.href)
  const files = await readdir(directory).catch(() => [])
  const cachedName = files.find(file => file.startsWith(key))
  if (cachedName !== undefined) {
    const cachedPath = join(directory, cachedName)
    const age = Date.now() - (await stat(cachedPath)).mtimeMs
    if (age < THUMB_MAX_AGE_MS) return { body: new Uint8Array(await readFile(cachedPath)), type: contentTypeFor(cachedPath) }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, IMAGE_TIMEOUT_MS)
  try {
    const result = await fetchPublic(imageUrl.href, controller.signal, 'image/png, image/jpeg, image/webp, image/avif')
    try {
      const { response } = result
      const mime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
      if (!response.ok || !mime || !Object.values(IMAGE_MIME).includes(mime)) {
        await response.body?.cancel()
        throw new Error('news: remote response is not a supported raster image')
      }
      const body = await readResponse(response, NEWS_IMAGE_LIMIT)
      const suffix = IMAGE_EXTENSIONS.has(extname(imageUrl.pathname).toLowerCase())
        ? extname(imageUrl.pathname).toLowerCase()
        : '.img'
      await mkdir(directory, { recursive: true })
      const path = join(directory, `${key}${suffix}`)
      await writeFile(path, body)
      return { body, type: response.headers.get('content-type')?.split(';', 1)[0] ?? 'application/octet-stream' }
    } finally { await result.close() }
  } finally {
    clearTimeout(timer)
  }
}

/** Host service for the News Remote and cache-bound thumbnail route. */
export class NewsService extends TypertRemoteService {
  static Config = Config
  static inject = ['timer', 'webServer']
  private readonly archivePath: string
  private readonly intake: KnowledgeStore
  private readonly cachePath: string
  private readonly thumbnailDir: string
  private refreshTask: Promise<StoredNewsCache> | undefined
  private archiveTask: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'news')
    this.cachePath = join(resolve(config.cacheDir), 'news.json')
    this.thumbnailDir = join(resolve(config.cacheDir), 'news-thumbs')
    this.archivePath = join(resolve(config.vaultRoot), 'Agents', '.generated', 'news', 'news.jsonl')
    this.intake = new KnowledgeStore(join(resolve(config.vaultRoot), 'Agents'))
    const route: WebRoute = { kind: 'exact', path: '/news/image', handler: this.handleImage }
    ctx.effect(() => ctx.webServer.register(route), 'news: image route')
    ctx.interval(() => { void this.backgroundRefresh() }, config.refreshIntervalMs)
    void this.backgroundRefresh()
  }

  /** Read the six-hour cache or crawl both feed columns. */
  @Remote('list')
  async list(request: NewsListRequest): Promise<NewsSnapshot> {
    const cache = await readCache(this.cachePath)
    if (!request.refresh && isFresh(cache)) return publicSnapshot(cache)
    return publicSnapshot(await this.refresh(cache))
  }

  private async archive(batch: NewsArchiveBatch, fetchedAt: string): Promise<void> {
    await appendNewsArchive(this.archivePath, batch, fetchedAt, false)
    await this.intake.saveFeed([...batch.news, ...batch.tools].map(item => ({
      sourceUrl: item.url, publisher: item.source, retrievedAt: fetchedAt, title: item.title,
      content: `${item.title}\n\n${item.summary}\n\nSource: ${item.url}`,
    })))
  }

  private queueArchive(batch: NewsArchiveBatch, fetchedAt: string): void {
    this.archiveTask = this.archiveTask.then(async () => {
      await this.archive(batch, fetchedAt)
    }).catch((error: unknown) => {
      this.ctx.logger.warn(`news: archive failed; feed remains available: ${String(error)}`)
    })
  }

  private async performRefresh(cache: StoredNewsCache | undefined): Promise<StoredNewsCache> {
    let fresh: CrawlResult
    try {
      fresh = await crawl()
    } catch (error) {
      if (cache !== undefined) return cache
      throw error
    }
    try {
      await writeCache(this.cachePath, fresh.cache)
    } catch {
      // A read-only cache directory must not hide a successful crawl.
    }
    this.queueArchive(fresh.archive, fresh.cache.fetchedAt)
    return fresh.cache
  }

  private async refresh(cache: StoredNewsCache | undefined): Promise<StoredNewsCache> {
    if (this.refreshTask !== undefined) return await this.refreshTask
    const task = this.performRefresh(cache)
    this.refreshTask = task
    try {
      return await task
    } finally {
      if (this.refreshTask === task) this.refreshTask = undefined
    }
  }

  private async backgroundRefresh(): Promise<void> {
    try {
      const cache = await readCache(this.cachePath)
      if (!isFresh(cache)) await this.refresh(cache)
      else if (cache !== undefined) this.queueArchive({ news: cache.news, tools: cache.tools }, cache.fetchedAt)
    } catch (error) {
      this.ctx.logger.warn(`news: background refresh failed: ${String(error)}`)
    }
  }

  private readonly handleImage = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405)
      res.end()
      return
    }
    const query = new URL(req.url ?? '/', 'http://localhost').searchParams
    const image = query.get('url')
    const article = query.get('article')
    const cache = await readCache(this.cachePath)
    if (image === null || article === null || cache === undefined) {
      res.writeHead(403)
      res.end()
      return
    }
    const allowed = [...cache.news, ...cache.tools].some(item => item.sourceImageUrl === image && item.url === article)
    if (!allowed) {
      res.writeHead(403)
      res.end()
      return
    }
    try {
      const response = await imageResponse(image, article, this.thumbnailDir)
      res.writeHead(200, { 'cache-control': 'public, max-age=604800', 'content-length': String(response.body.byteLength), 'content-type': response.type })
      res.end(req.method === 'HEAD' ? undefined : response.body)
    } catch {
      res.writeHead(502)
      res.end()
    }
  }
}

export default NewsService
