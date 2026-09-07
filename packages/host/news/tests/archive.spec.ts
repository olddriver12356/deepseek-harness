import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
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
  it('serializes overlapping archival and escapes feed markup in portable note filenames and content', async () => {
    const path = await archivePath()
    const entry = { ...item('https://example.com/unsafe'), title: '../Bad: [title] <script>alert(1)</script>', summary: '![[secret]] <script>bad</script>' }
    await Promise.all([
      appendNewsArchive(path, { news: [entry], tools: [] }, FETCHED_AT),
      appendNewsArchive(path, { news: [entry], tools: [] }, FETCHED_AT),
    ])
    expect((await readFile(path, 'utf8')).trim().split('\n')).toHaveLength(1)
    const files = (await readdir(dirname(path))).filter(name => name.endsWith('.md') && name !== 'AI News.md')
    expect(files).toHaveLength(1)
    expect(files[0]).not.toMatch(/[<>:"/\\|?*]/)
    const body = await readFile(join(dirname(path), files[0]!), 'utf8')
    expect(body).not.toContain('<script>')
    expect(body).not.toContain('![[secret]]')
    expect(body).toContain('&lt;script&gt;')
  })
  it('backfills notes, preserves edits and renamed exports, and repairs missing notes without new feed items', async () => {
    const path = await archivePath()
    const root = dirname(path)
    await mkdir(root, { recursive: true })
    const row = { ...item('https://example.com/old'), schema: 1, kind: 'news', fetchedAt: FETCHED_AT }
    await writeFile(path, JSON.stringify(row), 'utf8')
    await writeFile(join(root, 'legacy.md'), `---\nurl: ${JSON.stringify(row.url)}\nkind: news\n---\nMy edited note`, 'utf8')
    await writeFile(join(root, 'AI News.md'), '# My index\n\nPersonal text\n', 'utf8')
    await appendNewsArchive(path, { news: [item('https://example.com/new')], tools: [] }, FETCHED_AT)
    expect((await readFile(path, 'utf8')).trim().split('\n')).toHaveLength(2)
    expect(await readFile(join(root, 'legacy.md'), 'utf8')).toContain('My edited note')
    const generated = (await readdir(root)).find(name => name.endsWith('.md') && name !== 'legacy.md' && name !== 'AI News.md')!
    const note = await readFile(join(root, generated), 'utf8')
    expect(note).toContain('https://example.com/new')
    expect(note).toContain('Summary')
    await writeFile(join(root, generated), note + '\nMy notes', 'utf8')
    await appendNewsArchive(path, { news: [], tools: [] }, FETCHED_AT)
    expect(await readFile(join(root, generated), 'utf8')).toContain('My notes')
    await unlink(join(root, generated))
    await appendNewsArchive(path, { news: [], tools: [] }, FETCHED_AT)
    expect(await readFile(join(root, generated), 'utf8')).toBe(note)
    const index = await readFile(join(root, 'AI News.md'), 'utf8')
    expect(index).toContain('Personal text')
    expect(index).toContain('legacy.md')
    expect(index.match(/<!-- DSH-NEWS:START -->/g)).toHaveLength(1)
  })
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
