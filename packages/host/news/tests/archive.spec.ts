import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendNewsArchive } from '../src/archive.ts'
import type { CachedNewsItem } from '../src/feed.ts'
import { createTempArchive, removeTempArchives } from './support/archive-fixture.ts'

const FETCHED_AT = '2026-09-07T12:00:00.000Z'

afterEach(async () => {
  await removeTempArchives()
})

async function archivePath(): Promise<string> {
  return (await createTempArchive()).archivePath
}

function item(url: string): CachedNewsItem {
  return {
    title: `Title ${url}`,
    url,
    source: 'Test',
    publishedAt: '2026-09-07T10:00:00.000Z',
    summary: 'Summary',
    sourceImageUrl: 'https://example.com/image.jpg',
  }
}

describe('News archive', () => {
  it('appends each category and URL once across process restarts', async () => {
    const path = await archivePath()
    const entries = { news: [item('https://example.com/shared')], tools: [item('https://example.com/shared')] }
    await appendNewsArchive(path, entries, FETCHED_AT)
    await appendNewsArchive(path, entries, '2026-09-07T18:00:00.000Z')

    const rows = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { kind: string; url: string })
    expect(rows.map(row => `${row.kind}:${row.url}`)).toEqual([
      'news:https://example.com/shared',
      'tools:https://example.com/shared',
    ])
  })

  it('rejects malformed retained data instead of appending behind it', async () => {
    const path = await archivePath()
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '{broken\n', 'utf8')

    await expect(appendNewsArchive(path, { news: [item('https://example.com/new')], tools: [] }, FETCHED_AT))
      .rejects.toThrow('news archive: invalid JSONL at line 1')
  })
})
