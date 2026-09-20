import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const execute = promisify(execFile)

/** Save owner-entered text once, only in Ideas/Draft, after the Vault write guard. */
export async function saveQuickNote(vault: string, input: unknown): Promise<{ path: string }> {
  if (!input || typeof input !== 'object') throw new Error('Invalid quick note')
  const { id, text } = input as { id?: unknown; text?: unknown }
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || typeof text !== 'string' || !text.trim() || text.length > 20000 || text.includes('\0')) throw new Error('Invalid quick note')
  const root = resolve(vault)
  await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    join(root, 'Workspace/Projects/Central Hub/Sync/Invoke-VaultSyncGuard.ps1'), '-Mode', 'Assert'], { timeout: 30000, windowsHide: true })
  for (const path of [root, join(root, 'Ideas'), join(root, 'Ideas/Draft')]) {
    await mkdir(path, { recursive: true })
    const info = await lstat(path)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Quick note destination must be a real directory')
  }
  const filename = `Quick note ${id.toLowerCase()}.md`
  const path = join(root, 'Ideas/Draft', filename)
  const hash = createHash('sha256').update(text, 'utf8').digest('hex')
  const date = new Date()
  const created = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const markdown = `---\ntags: [idea, quick-note]\ncreated: ${created}\nfits: unfiled\nsource: dsh-quick-note\ncontent_hash: ${hash}\n---\n\n${text}\n`
  const temporary = join(root, 'Ideas/Draft', `.quick-note-${randomUUID()}.tmp`)
  await writeFile(temporary, markdown, { encoding: 'utf8', flag: 'wx' })
  try {
    try { await link(temporary, path) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Quick note destination is linked')
      const existing = await readFile(path, 'utf8')
      if (!existing.includes(`\ncontent_hash: ${hash}\n---\n\n`) || !existing.endsWith(`\n---\n\n${text}\n`)) throw new Error('Quick note ID already has different content')
    }
  } finally { await unlink(temporary) }
  return { path: `Ideas/Draft/${filename}` }
}
