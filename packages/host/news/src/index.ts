/** Host News Remote: cached public RSS feeds and a closed image proxy. */

import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { collectFeed, imageCacheKey, NEWS_IMAGE_LIMIT, NEWS_SOURCES, readResponse, TOOLS_SOURCES, type CachedNewsItem } from './feed.ts'
import type { NewsListRequest, NewsItem, NewsSnapshot } from './types.ts'

export type * from './types.ts'

/** Host configuration for the local News cache. */
export interface Config {
  /** Absolute or cwd-relative directory holding the feed and thumbnail cache. */
  readonly cacheDir: string
}

export const Config: z<Config> = z.object({
  cacheDir: z.string().required(),
})

const CACHE_SCHEMA = 1
const CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000
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

async function crawl(): Promise<StoredNewsCache> {
  const fetchedAt = new Date().toISOString()
  const [news, tools] = await Promise.all([
    collectFeed(NEWS_SOURCES, Date.now()),
    collectFeed(TOOLS_SOURCES, Date.now()),
  ])
  return sourceCache(news, tools, fetchedAt)
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
    const response = await fetch(imageUrl, { headers: { referer: articleUrl.href, 'user-agent': 'DeepSeekHarness/0.1' }, signal: controller.signal })
    if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('image/')) throw new Error('news: remote response is not an image')
    const body = await readResponse(response, NEWS_IMAGE_LIMIT)
    const suffix = IMAGE_EXTENSIONS.has(extname(imageUrl.pathname).toLowerCase())
      ? extname(imageUrl.pathname).toLowerCase()
      : '.img'
    await mkdir(directory, { recursive: true })
    const path = join(directory, `${key}${suffix}`)
    await writeFile(path, body)
    return { body, type: response.headers.get('content-type')?.split(';', 1)[0] ?? 'application/octet-stream' }
  } finally {
    clearTimeout(timer)
  }
}

/** Host service for the News Remote and cache-bound thumbnail route. */
export class NewsService extends TypertRemoteService {
  static inject = ['webServer']
  private readonly cachePath: string
  private readonly thumbnailDir: string

  constructor(ctx: Context, config: Config) {
    super(ctx, 'news')
    this.cachePath = join(resolve(config.cacheDir), 'news.json')
    this.thumbnailDir = join(resolve(config.cacheDir), 'news-thumbs')
    const route: WebRoute = { kind: 'exact', path: '/news/image', handler: this.handleImage }
    ctx.effect(() => ctx.webServer.register(route), 'news: image route')
  }

  /** Read the six-hour cache or crawl both feed columns. */
  @Remote('list')
  async list(request: NewsListRequest): Promise<NewsSnapshot> {
    const cache = await readCache(this.cachePath)
    if (!request.refresh && isFresh(cache)) return publicSnapshot(cache)
    try {
      const fresh = await crawl()
      try {
        await writeCache(this.cachePath, fresh)
      } catch {
        // A read-only cache directory must not hide a successful live crawl.
      }
      return publicSnapshot(fresh)
    } catch (error) {
      if (cache !== undefined) return publicSnapshot(cache)
      throw error
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
