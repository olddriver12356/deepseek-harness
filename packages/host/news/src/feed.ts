import { createHash } from 'node:crypto'

/** Public feed definition retained from the Boujoy News surface. */
export interface FeedSource {
  readonly name: string
  readonly url: string
}

/** Feed item before the same-origin image route is projected. */
export interface CachedNewsItem {
  readonly title: string
  readonly url: string
  readonly source: string
  readonly publishedAt: string | null
  readonly summary: string
  readonly sourceImageUrl: string | null
}

const MAX_TEXT_BYTES = 1_000_000
const MAX_IMAGE_BYTES = 6 * 1024 * 1024
const FETCH_TIMEOUT_MS = 18_000
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000

export const NEWS_SOURCES: readonly FeedSource[] = [
  { name: '量子位', url: 'https://www.qbitai.com/feed' },
  { name: 'MIT Tech', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed' },
  { name: 'HN ML', url: 'https://hnrss.org/newest?q=machine+learning' },
]

export const TOOLS_SOURCES: readonly FeedSource[] = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/' },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/' },
]

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  }
  return value
    .replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_, raw: string) => {
      const code = raw.startsWith('x') || raw.startsWith('X')
        ? Number.parseInt(raw.slice(1), 16)
        : Number.parseInt(raw, 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : ''
    })
    .replace(/&([a-z]+);/gi, (_, name: string) => named[name.toLowerCase()] ?? '')
}

function textValue(value: string): string {
  return decodeEntities(value.replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim()
}

function attributes(value: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const match of value.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)) {
    const name = match[1]
    const content = match[3]
    if (name !== undefined && content !== undefined) result[name.toLowerCase()] = decodeEntities(content)
  }
  return result
}

function childText(block: string, names: readonly string[]): string {
  for (const name of names) {
    const match = block.match(new RegExp(`<[^>]*:${name}\\b[^>]*>([\\s\\S]*?)</[^>]*:${name}\\s*>|<${name}\\b[^>]*>([\\s\\S]*?)</${name}\\s*>`, 'i'))
    const value = match?.[1] ?? match?.[2]
    if (value !== undefined) return textValue(value)
  }
  return ''
}

function safeUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(decodeEntities(value), baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function linkValue(block: string, baseUrl: string): string | null {
  const text = childText(block, ['link'])
  if (text !== '') return safeUrl(text, baseUrl)
  for (const match of block.matchAll(/<link\b([^>]*)>/gi)) {
    const href = attributes(match[1] ?? '').href
    if (href !== undefined) return safeUrl(href, baseUrl)
  }
  return null
}

function feedImage(block: string, baseUrl: string): string | null {
  for (const match of block.matchAll(/<([\w:-]+)\b([^>]*)>/gi)) {
    const name = (match[1] ?? '').split(':').at(-1)?.toLowerCase()
    const attrs = attributes(match[2] ?? '')
    const type = attrs.type?.toLowerCase() ?? ''
    if (name === 'enclosure' && type.startsWith('image/')) {
      const candidate = safeUrl(attrs.url ?? '', baseUrl)
      if (candidate !== null) return candidate
    }
    if ((name === 'content' || name === 'thumbnail') && (type.startsWith('image/') || attrs.url !== undefined)) {
      for (const key of ['url', 'src', 'href']) {
        const candidate = safeUrl(attrs[key] ?? '', baseUrl)
        if (candidate !== null) return candidate
      }
    }
  }
  const body = ['description', 'summary', 'content', 'encoded'].map(name => childText(block, [name])).join(' ')
  const image = body.match(/<img\b[^>]*\b(?:src|data-src|data-original)\s*=\s*(["'])(.*?)\1/i)?.[2]
  return image === undefined ? null : safeUrl(image, baseUrl)
}

/** Parse RSS or Atom entries without introducing an XML dependency. */
export function parseFeed(xml: string, source: FeedSource, cutoff: number): CachedNewsItem[] {
  const blocks = xml.match(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)\s*>/gi) ?? []
  const items: CachedNewsItem[] = []
  for (const block of blocks) {
    const title = childText(block, ['title'])
    const url = linkValue(block, source.url)
    if (title === '' || url === null) continue
    const rawDate = childText(block, ['pubDate', 'published', 'updated', 'date'])
    const timestamp = rawDate === '' ? Number.NaN : Date.parse(rawDate)
    if (Number.isFinite(timestamp) && timestamp < cutoff) continue
    const description = childText(block, ['description', 'summary', 'content', 'encoded'])
    items.push({
      title,
      url,
      source: source.name,
      publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null,
      summary: textValue(description).slice(0, 180),
      sourceImageUrl: feedImage(block, source.url),
    })
  }
  return items
}

/** Parse a declared article cover image from a same-publisher HTML page. */
export function parseArticleCover(html: string, articleUrl: string): string | null {
  const meta = html.match(/<meta\b[^>]*(?:property|name)\s*=\s*(["'])(?:og:image(?::url)?|twitter:image(?::src)?)\1[^>]*>/i)?.[0]
  const metaImage = meta === undefined ? undefined : attributes(meta).content
  if (metaImage !== undefined) return safeUrl(metaImage, articleUrl)
  const link = html.match(/<link\b[^>]*rel\s*=\s*(["'])[^"']*image_src[^"']*\1[^>]*>/i)?.[0]
  const linkImage = link === undefined ? undefined : attributes(link).href
  if (linkImage !== undefined) return safeUrl(linkImage, articleUrl)
  const bodyImage = html.match(/<img\b[^>]*\b(?:src|data-src|data-original)\s*=\s*(["'])(.*?)\1/i)?.[2]
  return bodyImage === undefined ? null : safeUrl(bodyImage, articleUrl)
}

/** Read a fetch response with a byte ceiling. */
export async function readResponse(response: Response, limit: number): Promise<Uint8Array> {
  if (response.body === null) {
    const body = new Uint8Array(await response.arrayBuffer())
    if (body.byteLength > limit) throw new Error('news: response exceeds size limit')
    return body
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const next = await reader.read()
    if (next.done) break
    total += next.value.byteLength
    if (total > limit) {
      await reader.cancel()
      throw new Error('news: response exceeds size limit')
    }
    chunks.push(next.value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

/** Fetch one UTF-8 text resource from a fixed public source. */
export async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'DeepSeekHarness/0.1', accept: 'application/rss+xml, application/atom+xml, text/html' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`news: source returned HTTP ${String(response.status)}`)
    return new TextDecoder().decode(await readResponse(response, MAX_TEXT_BYTES))
  } finally {
    clearTimeout(timer)
  }
}

/** Collect and enrich one column, retaining the newest ten entries. */
export async function collectFeed(sources: readonly FeedSource[], now: number): Promise<CachedNewsItem[]> {
  const cutoff = now - THREE_DAYS_MS
  const results = await Promise.all(sources.map(async (source) => {
    try {
      return parseFeed(await fetchText(source.url), source, cutoff)
    } catch {
      return null
    }
  }))
  const parsed = results.flatMap(result => result ?? [])
  if (parsed.length === 0 && results.every(result => result === null)) {
    throw new Error('news: all configured sources failed')
  }
  const unique = new Map<string, CachedNewsItem>()
  for (const item of parsed.sort((left, right) => (right.publishedAt ?? '').localeCompare(left.publishedAt ?? ''))) {
    if (!unique.has(item.url)) unique.set(item.url, item)
  }
  const selected = [...unique.values()].slice(0, 10)
  return await Promise.all(selected.map(async (item) => {
    if (item.sourceImageUrl !== null) return item
    try {
      const cover = parseArticleCover(await fetchText(item.url), item.url)
      return cover === null ? item : { ...item, sourceImageUrl: cover }
    } catch {
      return item
    }
  }))
}

/** Stable thumbnail filename prefix for one exact source image URL. */
export function imageCacheKey(url: string): string {
  return createHash('sha256').update(url, 'utf8').digest('hex')
}

export const NEWS_IMAGE_LIMIT = MAX_IMAGE_BYTES
