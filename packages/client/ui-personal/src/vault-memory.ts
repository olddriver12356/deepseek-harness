import { lstat, readdir, realpath, open } from 'node:fs/promises'
import { resolve, relative, isAbsolute, sep } from 'node:path'

export type MemoryTier = 'working' | 'episodic' | 'semantic' | 'handoff' | 'flags'
export interface MemoryFile { path: string; title: string; tier: MemoryTier; modified: string }
const folders = { Episodic: 'episodic', Semantic: 'semantic', Handoff: 'handoff' } as const
const MAX_FILE_BYTES = 1_048_576 // Bound untrusted file reads, including files that grow while open.

function tierOf(path: string): MemoryTier | undefined {
  if (path === 'Working Memory.md') return 'working'
  if (path === 'Flags.md') return 'flags'
  return folders[path.split('/')[0] as keyof typeof folders]
}

async function memoryRoot(vault: string): Promise<string> {
  const root = await realpath(vault)
  const memory = await realpath(resolve(root, 'Memory'))
  if (relative(root, memory) !== 'Memory') throw new Error('Memory must be a directory inside the configured Vault')
  return memory
}

async function checkedFile(root: string, path: string): Promise<string> {
  if (path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')
    || isAbsolute(path) || !path.endsWith('.md') || tierOf(path) === undefined) throw new Error('Invalid memory path')
  const target = await realpath(resolve(root, path))
  const rel = relative(root, target)
  if (rel.startsWith('..' + sep) || rel === '..' || isAbsolute(rel) || rel.split(sep).join('/') !== path) throw new Error('Memory links cannot leave their source path')
  return target
}

/** List only the four memory tiers and Flags; no symlink traversal or vault-wide scan. */
export async function listMemory(vault: string): Promise<MemoryFile[]> {
  let root: string
  try { root = await memoryRoot(vault) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  const files: MemoryFile[] = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue
      const path = directory ? `${directory}/${entry.name}` : entry.name
      const tier = tierOf(path)
      if (entry.isDirectory() && (directory !== '' || entry.name in folders)) {
        await checkedDirectory(path)
      } else if (entry.isFile() && path.endsWith('.md') && tier !== undefined) {
        if (files.length >= 5000) throw new Error('Memory catalog exceeds its safe listing limit')
        const target = await checkedFile(root, path)
        const info = await lstat(target)
        files.push({ path, title: entry.name.slice(0, -3), tier, modified: info.mtime.toISOString() })
      }
    }
  }
  async function checkedDirectory(path: string): Promise<void> {
    const canonical = await realpath(resolve(root, path))
    if (relative(root, canonical).split(sep).join('/') !== path) throw new Error('Invalid memory directory')
    await visit(path)
  }
  await visit('')
  return files.sort((a, b) => b.path.localeCompare(a.path))
}

/** Read one allowlisted Markdown document without modifying the source. */
export async function readMemory(vault: string, path: string): Promise<{ path: string; content: string; modified: string }> {
  const root = await memoryRoot(vault)
  const target = await checkedFile(root, path)
  const handle = await open(target, 'r')
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.size > MAX_FILE_BYTES) throw new Error('Memory document is unavailable or too large')
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset > MAX_FILE_BYTES) throw new Error('Memory document is too large')
    return { path, content: buffer.subarray(0, offset).toString('utf8'), modified: info.mtime.toISOString() }
  } finally { await handle.close() }
}
