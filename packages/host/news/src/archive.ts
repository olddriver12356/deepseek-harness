import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { syncNewsNotes } from './notes.ts'
import { dirname, resolve } from 'node:path'
import type { CachedNewsItem } from './feed.ts'

export interface NewsArchiveBatch {
  readonly news: readonly CachedNewsItem[]
  readonly tools: readonly CachedNewsItem[]
}

export interface ArchivedNewsItem {
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

function parseArchive(value: string): ArchivedNewsItem[] {
  const records: ArchivedNewsItem[] = []
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
    if (typeof record.title !== 'string' || typeof record.source !== 'string' || typeof record.summary !== 'string'
      || typeof record.fetchedAt !== 'string' || !Number.isFinite(Date.parse(record.fetchedAt))
      || (record.publishedAt !== null && (typeof record.publishedAt !== 'string' || !Number.isFinite(Date.parse(record.publishedAt))))) {
      throw new Error(`news archive: invalid record at line ${String(index + 1)}`)
    }
    const url = new URL(record.url)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('news archive: invalid article URL')
    records.push(record as unknown as ArchivedNewsItem)
  }
  return records
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
const pending = new Map<string, Promise<number>>()

export async function appendNewsArchive(path: string, batch: NewsArchiveBatch, fetchedAt: string, projectNotes = true): Promise<number> {
  const target = resolve(path)
  const previous = pending.get(target)
  const task = (previous ?? Promise.resolve(0)).catch(() => 0).then(async () => await append(target, batch, fetchedAt, projectNotes))
  pending.set(target, task)
  try {
    return await task
  } finally {
    if (pending.get(target) === task) pending.delete(target)
  }
}

async function append(path: string, batch: NewsArchiveBatch, fetchedAt: string, projectNotes: boolean): Promise<number> {
  // ponytail: one sequential scan per crawl; add a side index only when archive size makes this measurable.
  const retained = await readArchive(path)
  const records = parseArchive(retained)
  const known = new Set(records.map(item => archiveKey(item.kind, item.url)))
  const fresh: ArchivedNewsItem[] = []
  for (const [kind, items] of [['news', batch.news], ['tools', batch.tools]] as const) {
    for (const item of items) {
      const key = archiveKey(kind, item.url)
      if (known.has(key)) continue
      known.add(key)
      fresh.push(archivedItem(kind, item, fetchedAt))
    }
  }
  await mkdir(dirname(path), { recursive: true })
  if (fresh.length > 0) {
    const separator = retained !== '' && !retained.endsWith('\n') ? '\n' : ''
    await appendFile(path, `${separator}${fresh.map(item => JSON.stringify(item)).join('\n')}\n`, 'utf8')
  }
  if (projectNotes) await syncNewsNotes(dirname(path), [...records, ...fresh])
  return fresh.length
}
