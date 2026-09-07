import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ArchivedNewsItem } from './archive.ts'

const START = '<!-- DSH-NEWS:START -->'
const END = '<!-- DSH-NEWS:END -->'

function plain(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)
    .replace(/([\\`*_[\]{}!|])/g, '\\$1')
}

/** Create missing article notes and replace only the marked index region. Existing articles are never overwritten. */
export async function syncNewsNotes(directory: string, records: readonly ArchivedNewsItem[]): Promise<void> {
  const existing = new Map<string, string>()
  // ponytail: scan note frontmatter per refresh; add an index only when archive size makes this measurable.
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const body = await readFile(join(directory, entry.name), 'utf8')
    const header = body.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1]
    const url = header?.match(/^url: (.+)\r?$/m)?.[1]?.trim()
    const kind = header?.match(/^kind: (news|tools)\r?$/m)?.[1]
    if (url !== undefined && kind !== undefined) existing.set(`${kind}:${url}`, entry.name)
  }
  const links = new Map<string, string>()
  for (const record of records) {
    const key = `${record.kind}:${JSON.stringify(record.url)}`
    const hash = createHash('sha256').update(key).digest('hex').slice(0, 16)
    const title = record.title.replace(/[<>:"/\\|?*\u0000-\u001f#\[\]^]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/[. ]+$/g, '')
    const filename = existing.get(key) ?? `${(record.publishedAt ?? record.fetchedAt).slice(0, 10)} ${title} ${hash}.md`
    if (!existing.has(key)) {
      const body = `---\ntags: [ai-news, dsh, raw-intake]\ncreated: ${record.fetchedAt.slice(0, 10)}\nsource: ${JSON.stringify(record.source)}\nurl: ${JSON.stringify(record.url)}\npublished: ${JSON.stringify(record.publishedAt)}\nfetched: ${JSON.stringify(record.fetchedAt)}\nkind: ${record.kind}\n---\n\n# ${plain(record.title)}\n\n${plain(record.source)} · ${record.publishedAt ?? 'Unknown date'}\n\n[Read original article](${new URL(record.url).href.replace(/[()]/g, char => encodeURIComponent(char).replace('(', '%28').replace(')', '%29'))})\n\n## Feed summary\n\n${plain(record.summary) || 'The source feed did not include a summary.'}\n\nFeed metadata only; the full article is not retained and its claims have not been independently verified.\n\n[[AI News]]\n`
      try {
        await writeFile(join(directory, filename), body, { encoding: 'utf8', flag: 'wx' })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        const saved = await readFile(join(directory, filename), 'utf8')
        if (!saved.includes(`url: ${JSON.stringify(record.url)}\n`) || !saved.includes(`kind: ${record.kind}\n`)) throw new Error(`news: note filename conflict: ${filename}`)
      }
      existing.set(key, filename)
    }
    links.set(key, `- [${plain(record.title)}](<${encodeURIComponent(filename)}>)`)
  }
  const indexPath = join(directory, 'AI News.md')
  let index: string
  try {
    index = await readFile(indexPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    index = '---\ntags: [resource, ai-news, dsh]\n---\n\n# AI News\n'
  }
  const start = index.indexOf(START)
  const end = index.indexOf(END)
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) throw new Error('news: malformed index markers')
  const region = `${START}\n## Saved news\n\n${[...links.values()].join('\n')}\n${END}`
  const updated = start === -1 ? `${index.trimEnd()}\n\n${region}\n` : `${index.slice(0, start)}${region}${index.slice(end + END.length)}`
  if (updated !== index) await writeFile(indexPath, updated, 'utf8')
}
