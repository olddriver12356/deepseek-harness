/** Workspace-addressed physical skill editing, independent of invocation catalogs. */
import { Context } from '@deepseek-ai/cordis'
import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { access, lstat, mkdir, open, readdir, realpath, rename, stat, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'
import { z } from 'zod'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { resolveSkillRoots, frontmatterBoolean, type SkillRoot } from '@deepseek-ai/dsh-skill-filesystem'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SkillArtifact, SkillArtifactId, SkillDeleteRequest, SkillDeleteResult, SkillFileContent, SkillFileRequest, SkillFileWriteRequest, SkillInventory, SkillTreeEntry } from './types.ts'

const MAX_TEXT_BYTES = 2 * 1024 * 1024
const MAX_TREE_ENTRIES = 5000
const requestSchema = z.object({ workspaceId: z.string().min(1), id: z.string().min(1), file: z.string() })
const writeSchema = requestSchema.extend({
  content: z.string().max(MAX_TEXT_BYTES), revision: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
})
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)
const absent = (error: unknown): boolean => error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')
function within(root: string, path: string): boolean {
  const child = relative(root, path)
  return !isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`)
}
async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch (error) { if (absent(error)) return false; throw error }
}
function filePath(root: string, file: string): string {
  if (file === '' || /[\x00-\x1f:]/.test(file) || file.split(/[/\\]/).some(part => part === '..' || part === '.' || part === '')) throw new Error('Invalid relative skill file path')
  const target = resolve(root, file)
  if (!within(root, target) || target === root) throw new Error('File escapes the skill bundle')
  return target
}

/** Host storage owner. Roots come from the same resolver as runtime discovery. */
export class SkillFileStore {
  // ponytail: one editor write at a time; use per-file locks if write throughput matters.
  private operations: Promise<void> = Promise.resolve()
  constructor(private readonly roots: (cwd: string) => Promise<SkillRoot[]> = cwd => resolveSkillRoots(cwd)) {}

  async inventory(cwd: string, onlyId?: SkillArtifactId): Promise<SkillInventory> {
    const roots = await this.roots(cwd)
    const skills: SkillArtifact[] = []
    const canonical = new Set<string>()
    const names = new Set<string>()
    for (const root of roots) {
      let entries
      try { entries = await readdir(root.path) } catch (error) { if (absent(error)) continue; throw error }
      for (const entry of entries.sort()) {
        if (entry === '.dsh-skill-trash') continue
        if (root.skipSystem && entry === '.system') continue
        const candidate = join(root.path, entry)
        if (onlyId !== undefined && hash(candidate) !== onlyId && hash(join(candidate, 'SKILL.md')) !== onlyId) continue
        let info
        try { info = await stat(candidate) } catch (error) { if (absent(error)) continue; throw error }
        const path = info.isDirectory() ? join(candidate, 'SKILL.md') : entry.endsWith('.md') && info.isFile() ? candidate : undefined
        if (path === undefined || !await exists(path)) continue
        const canonicalPath = await realpath(path)
        const key = process.platform === 'win32' ? canonicalPath.toLowerCase() : canonicalPath
        if (canonical.has(key)) continue
        canonical.add(key)
        let name = info.isDirectory() ? entry : entry.slice(0, -3)
        let description = '', category = '', problem = ''
        let userInvocable = true, modelInvocable = true
        try {
          const loaded = await this.readText(canonicalPath)
          if (loaded.content === null) throw new Error('Not an editable UTF-8 skill document')
          const match = /^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(loaded.content)
          if (match === null) throw new Error('Missing YAML frontmatter')
          const doc = parseDocument(match[1] ?? '')
          if (doc.errors[0] !== undefined) throw doc.errors[0]
          const data: unknown = doc.toJS()
          const parsed = z.looseObject({
            name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            description: z.string().min(1), metadata: z.record(z.string(), z.unknown()).optional(),
          }).parse(data)
          name = parsed.name
          description = parsed.description
          category = typeof parsed.metadata?.category === 'string' ? parsed.metadata.category : ''
          userInvocable = frontmatterBoolean(parsed, 'user-invocable') ?? true
          modelInvocable = !(frontmatterBoolean(parsed, 'disable-model-invocation') ?? false)
        } catch (error) { problem = message(error) }
        const shadowed = names.has(name)
        if (problem === '') names.add(name)
        skills.push({ id: hash(path) as SkillArtifactId, name, description, category, path, canonicalPath, entryFile: basename(path), bundle: info.isDirectory(), source: root.source, scope: root.source.startsWith('project-') ? 'project' : root.source.startsWith('user-') ? 'personal' : 'other', userInvocable, modelInvocable, shadowed, writable: root.source !== 'bundled', problem })
      }
    }
    return { skills, projectDestination: roots.find(root => root.source === 'project-agents')?.path ?? '', personalDestination: roots.find(root => root.source === 'user-agents')?.path ?? '' }
  }

  private async artifact(cwd: string, id: SkillArtifactId): Promise<{ item: SkillArtifact; root: string; flat: boolean }> {
    const item = (await this.inventory(cwd, id)).skills.find(skill => skill.id === id)
    if (item === undefined) throw new Error('Skill no longer exists; refresh the inventory')
    const flat = !item.bundle
    return { item, root: flat ? dirname(item.canonicalPath) : await realpath(dirname(item.path)), flat }
  }

  private async target(cwd: string, request: SkillFileRequest, creating = false): Promise<{ path: string; item: SkillArtifact }> {
    const { item, root, flat } = await this.artifact(cwd, request.id)
    if (flat && request.file !== item.entryFile) throw new Error('A flat skill exposes only its own file')
    const path = flat ? item.canonicalPath : filePath(root, request.file)
    let current = path
    while (!await exists(current)) {
      if (!creating) throw new Error('Skill file no longer exists')
      current = dirname(current)
    }
    if (!within(root, await realpath(current))) throw new Error('Linked file escapes the canonical skill bundle')
    return { path, item }
  }

  async tree(cwd: string, id: SkillArtifactId): Promise<readonly SkillTreeEntry[]> {
    const { item, root, flat } = await this.artifact(cwd, id)
    if (flat) return [{ path: item.entryFile, kind: 'file' }]
    const entries: SkillTreeEntry[] = []
    const walk = async (directory: string): Promise<void> => {
      for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entries.length >= MAX_TREE_ENTRIES) throw new Error('Skill tree exceeds 5000 entries')
        const path = join(directory, entry.name)
        const kind = entry.isSymbolicLink() ? 'blocked' : entry.isDirectory() ? 'directory' : 'file'
        entries.push({ path: relative(root, path).split(sep).join('/'), kind })
        if (kind === 'directory') await walk(path)
      }
    }
    await walk(root)
    return entries
  }

  async read(cwd: string, request: SkillFileRequest): Promise<SkillFileContent> {
    requestSchema.parse(request)
    const { path } = await this.target(cwd, request)
    return { file: request.file, ...await this.readText(path) }
  }

  private async readText(path: string): Promise<Omit<SkillFileContent, 'file'>> {
    const handle = await open(path, 'r')
    try {
      const info = await handle.stat()
      if (!info.isFile()) throw new Error('Not a regular file')
      if (info.size > MAX_TEXT_BYTES) return { content: null, revision: '', bytes: info.size }
      const bytes = await handle.readFile()
      let content: string | null = null
      try { if (!bytes.includes(0)) content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) } catch { /* Non-UTF-8 files remain visible and read-only. */ }
      if (bytes.length > MAX_TEXT_BYTES) content = null
      return { content, revision: createHash('sha256').update(await realpath(path)).update('\0').update(bytes).digest('hex'), bytes: bytes.length }
    } finally { await handle.close() }
  }

  async write(cwd: string, request: SkillFileWriteRequest): Promise<SkillFileContent> {
    writeSchema.parse(request)
    if (Buffer.byteLength(request.content) > MAX_TEXT_BYTES) throw new Error('Text exceeds 2 MiB')
    const operation = this.operations.then(async () => {
      const { path, item } = await this.target(cwd, request, request.revision === null)
      if (!item.writable) throw new Error('Bundled skills are read-only')
      await this.guard(path)
      // Re-resolve after the guard subprocess before touching the file.
      await this.target(cwd, request, request.revision === null)
      if (request.revision === null) {
        await mkdir(dirname(path), { recursive: true })
        await this.target(cwd, request, true)
        const handle = await open(path, 'wx')
        try { await handle.writeFile(request.content, 'utf8') } finally { await handle.close() }
      } else {
        const loaded = await this.readText(path)
        if (loaded.content === null) throw new Error('File is not editable UTF-8 text')
        if (loaded.revision !== request.revision) throw new Error('File changed externally; your edits are preserved. Reload before saving.')
        if ((await lstat(path)).isSymbolicLink()) throw new Error('Edit the canonical file instead of replacing a link')
        const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
        try {
          const handle = await open(temporary, 'wx', (await stat(path)).mode)
          try {
            await handle.writeFile(request.content, 'utf8')
            await handle.sync()
          } finally { await handle.close() }
          await this.target(cwd, request)
          if ((await this.readText(path)).revision !== request.revision) throw new Error('File changed externally; your edits are preserved')
          await rename(temporary, path)
        } finally { try { await unlink(temporary) } catch (error) { if (!absent(error)) throw error } }
      }
      return { file: request.file, ...await this.readText(path) }
    })
    this.operations = operation.then(() => undefined, () => undefined)
    return operation
  }

  /** @param cwd - registered workspace directory. @param request - confirmed source identity. @returns recoverable entry location. */
  async remove(cwd: string, request: SkillDeleteRequest): Promise<SkillDeleteResult> {
    z.object({ workspaceId: z.string().min(1), id: z.string().min(1), canonicalPath: z.string().min(1) }).parse(request)
    const operation = this.operations.then(async () => {
      let { item } = await this.artifact(cwd, request.id)
      if (!item.writable) throw new Error('Bundled skills are read-only')
      if (item.canonicalPath !== request.canonicalPath) throw new Error('Skill source changed; refresh before deleting')
      // Move the source entry, never resolve its final link into a shared target.
      const entry = item.bundle ? dirname(item.path) : item.path
      const parent = await realpath(dirname(entry))
      const target = join(parent, basename(entry))
      await this.guard(target)
      ;({ item } = await this.artifact(cwd, request.id))
      if (!item.writable || item.canonicalPath !== request.canonicalPath) throw new Error('Skill source changed; refresh before deleting')
      if (await realpath(dirname(entry)) !== parent) throw new Error('Skill root changed; refresh before deleting')
      const trash = join(parent, '.dsh-skill-trash')
      try { await mkdir(trash, { mode: 0o700 }) } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      }
      const info = await lstat(trash)
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Recovery directory must not be a link')
      const container = join(trash, randomUUID())
      await mkdir(container, { mode: 0o700 })
      const recoveryPath = join(container, basename(entry))
      await rename(target, recoveryPath)
      return { recoveryPath }
    })
    this.operations = operation.then(() => undefined, () => undefined)
    return operation
  }

  private async guard(path: string): Promise<void> {
    let directory = dirname(path)
    while (true) {
      const guard = join(directory, 'Workspace/Projects/Central Hub/Sync/Invoke-VaultSyncGuard.ps1')
      if (await exists(guard)) {
        await promisify(execFile)(process.platform === 'win32' ? 'powershell.exe' : 'pwsh', ['-NoProfile', '-File', guard, '-Mode', 'Assert'], { windowsHide: true })
        return
      }
      const parent = dirname(directory)
      if (parent === directory) return
      directory = parent
    }
  }
}

declare module '@deepseek-ai/cordis' { interface Context { skillFilesController: SkillFilesController } }

/** Remote editor restricted to registered Workspaces and configured skill roots. */
export class SkillFilesController extends TypertRemoteService {
  static inject = ['workspaceRegistry']
  private readonly store = new SkillFileStore()
  constructor(ctx: Context) { super(ctx, 'skillFilesController', { namespace: 'skillFiles' }) }
  private cwd(id: WorkspaceId): string {
    z.string().min(1).parse(id)
    const workspace = this.ctx.workspaceRegistry.get(id)
    if (workspace === undefined) throw new Error('Unknown Workspace')
    return workspace.path
  }
  /**
   * List physical skill sources available to the workspace.
   * @param workspaceId - registered workspace.
   * @returns physical skill inventory.
   */
  @Remote('list')
  list(workspaceId: WorkspaceId): Promise<SkillInventory> { return this.store.inventory(this.cwd(workspaceId)) }
  /**
   * Read a skill bundle's file tree.
   * @param workspaceId - registered workspace.
   * @param id - physical skill.
   * @returns bundle tree.
   */
  @Remote('tree')
  tree(workspaceId: WorkspaceId, id: SkillArtifactId): Promise<readonly SkillTreeEntry[]> {
    return this.store.tree(this.cwd(workspaceId), id)
  }
  /**
   * Read one file from a registered skill source.
   * @param request - scoped file identity.
   * @returns text or binary summary and revision.
   */
  @Remote('read')
  read(request: SkillFileRequest): Promise<SkillFileContent> { return this.store.read(this.cwd(request.workspaceId), request) }
  /**
   * Save a file after checking its expected revision.
   * @param request - scoped file and expected revision.
   * @returns committed file readback.
   */
  @Remote('write')
  write(request: SkillFileWriteRequest): Promise<SkillFileContent> { return this.store.write(this.cwd(request.workspaceId), request) }
  /**
   * Move a confirmed skill source into recoverable storage.
   * @param request - confirmed skill source identity.
   * @returns recoverable entry location.
   */
  @Remote('deleteSkill')
  deleteSkill(request: SkillDeleteRequest): Promise<SkillDeleteResult> { return this.store.remove(this.cwd(request.workspaceId), request) }
}
