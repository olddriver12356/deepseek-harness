import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CachedNewsItem } from './feed.ts'

export interface NewsArchiveBatch {
  readonly news: readonly CachedNewsItem[]
  readonly tools: readonly CachedNewsItem[]
}

interface ArchivedNewsItem {
  readonly schema: 1
  readonly kind: 'news' | 'tools'
  readonly fetchedAt: string
  readonly title: string
  readonly url: string
  readonly source: string
  readonly publishedAt: string | null
  readonly summary: string
}

function archiveKey(kind: ArchivedNewsItem['kind'], url: string): string {
  return `${kind}\u0000${url}`
}

function parseArchive(value: string): Set<string> {
  const keys = new Set<string>()
  const lines = value.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? ''
    if (line === '') continue
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new Error(`news archive: invalid JSONL at line ${String(index + 1)}`)
    }
    if (parsed === null || typeof parsed !== 'object') throw new Error(`news archive: invalid record at line ${String(index + 1)}`)
    const record = parsed as Record<string, unknown>
    if (record.schema !== 1 || (record.kind !== 'news' && record.kind !== 'tools') || typeof record.url !== 'string') {
      throw new Error(`news archive: invalid record at line ${String(index + 1)}`)
    }
    keys.add(archiveKey(record.kind, record.url))
  }
  return keys
}

async function readArchive(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

function archivedItem(kind: ArchivedNewsItem['kind'], item: CachedNewsItem, fetchedAt: string): ArchivedNewsItem {
  return {
    schema: 1,
    kind,
    fetchedAt,
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    summary: item.summary,
  }
}

/** Append newly observed feed entries to one deduplicated Vault JSONL archive. */
export async function appendNewsArchive(path: string, batch: NewsArchiveBatch, fetchedAt: string): Promise<number> {
  // ponytail: one sequential scan per crawl; add a side index only when archive size makes this measurable.
  const known = parseArchive(await readArchive(path))
  const fresh: ArchivedNewsItem[] = []
  for (const [kind, items] of [['news', batch.news], ['tools', batch.tools]] as const) {
    for (const item of items) {
      const key = archiveKey(kind, item.url)
      if (known.has(key)) continue
      known.add(key)
      fresh.push(archivedItem(kind, item, fetchedAt))
    }
  }
  if (fresh.length === 0) return 0
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${fresh.map(item => JSON.stringify(item)).join('\n')}\n`, 'utf8')
  return fresh.length
}
