import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { StyleDraft, StyleRecord, StyleStatus } from './types.ts'

const ARTIFACT = 'ARTIFACT.md'
const TITLE_PATTERN = /^[^<>:"/\\|?*\u0000-\u001f]+$/u
const STATUSES = new Set<StyleStatus>(['draft', 'approved', 'suspended'])

interface ParsedArtifact {
  readonly data: Record<string, unknown>
  readonly directory: string
}

function field(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === 'string' ? data[key] : ''
}

function parseFrontmatter(text: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(text)
  if (match?.[1] === undefined) throw new Error('styles: ARTIFACT.md has invalid frontmatter')
  const data: Record<string, unknown> = {}
  for (const line of match[1].split(/\r?\n/u)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const pair = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u.exec(line)
    if (pair?.[1] === undefined || pair[2] === undefined) throw new Error(`styles: unsupported frontmatter line: ${line}`)
    const raw = pair[2].trim()
    if (raw === '') data[pair[1]] = null
    else {
      try { data[pair[1]] = JSON.parse(raw) as unknown }
      catch { data[pair[1]] = raw.replace(/^'(.*)'$/u, '$1') }
    }
  }
  return data
}

function instructionsOf(text: string): string {
  const match = /(?:^|\r?\n)## Instructions\r?\n\r?\n([\s\S]*?)(?=\r?\n## |$)/u.exec(text)
  if (match?.[1] === undefined) throw new Error('styles: ARTIFACT.md has no Instructions section')
  return match[1].trim()
}

function recordOf(directory: string, text: string): StyleRecord {
  const data = parseFrontmatter(text)
  const status = field(data, 'expert_status')
  if (data.artifact_type !== 'Method' || data.method_kind !== 'Style' || !STATUSES.has(status as StyleStatus)) {
    throw new Error(`styles: ${basename(directory)} is not a valid Style Method`)
  }
  const name = field(data, 'title')
  if (name !== basename(directory)) throw new Error(`styles: title does not match package directory: ${name}`)
  return {
    id: field(data, 'id'),
    name,
    description: field(data, 'description'),
    instructions: instructionsOf(text),
    status: status as StyleStatus,
    updatedAt: field(data, 'updated'),
  }
}

function validateDraft(input: StyleDraft): StyleDraft {
  const draft = {
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    instructions: input.instructions.trim(),
  }
  if (draft.name.length === 0 || draft.name.length > 80 || !TITLE_PATTERN.test(draft.name) || draft.name.endsWith('.') || draft.name.endsWith(' ')) {
    throw new Error('styles: name is not a valid package title')
  }
  if (draft.description.length === 0 || draft.description.length > 180 || draft.instructions.length === 0) {
    throw new Error('styles: description and instructions are required')
  }
  if (!STATUSES.has(draft.status)) throw new Error('styles: invalid status')
  return draft
}

function frontmatter(data: Record<string, unknown>): string {
  const order = [
    'schema_version', 'id', 'title', 'artifact_type', 'method_kind', 'layer', 'status', 'expert_status',
    'owner_approved', 'topics', 'description', 'created', 'updated', 'created_by', 'source_kind', 'provenance', 'derived_from',
  ]
  const keys = [...order.filter(key => key in data), ...Object.keys(data).filter(key => !order.includes(key)).sort()]
  return `---\n${keys.map(key => `${key}: ${JSON.stringify(data[key])}`).join('\n')}\n---\n`
}

function artifactText(id: string, draft: StyleDraft, created: string): string {
  const now = new Date().toISOString()
  const data = {
    schema_version: 1,
    id,
    title: draft.name,
    artifact_type: 'Method',
    method_kind: 'Style',
    layer: '5 Methods',
    status: 'active',
    expert_status: draft.status,
    owner_approved: draft.status === 'approved',
    topics: ['style'],
    description: draft.description,
    created,
    updated: now.slice(0, 10),
    created_by: 'DSH Styles UI',
    source_kind: 'owner_input',
    provenance: { body_section: 'Provenance record' },
    derived_from: [],
  }
  const event = JSON.stringify({ event_id: `style-${randomUUID()}`, event_type: 'style_saved', at: now })
  const provenance = JSON.stringify({ source_kind: 'owner_input', original_statement: 'Created in DSH Styles UI', captured_at: now, origin_run: 'dsh-styles-ui' })
  return `${frontmatter(data)}\n# ${draft.name}\n\n${draft.description}\n\n## Instructions\n\n${draft.instructions}\n\n## Provenance record\n\n\`\`\`json\n${provenance}\n\`\`\`\n\n## Evidence pointers\n\n\`\`\`json\n[]\n\`\`\`\n\n## Gate receipts\n\n\`\`\`jsonl\n\`\`\`\n\n## Processing history\n\n\`\`\`jsonl\n${event}\n\`\`\`\n`
}

function isWithin(base: string, candidate: string): boolean {
  const path = relative(base, candidate)
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)
}

async function runPowerShell(script: string, args: readonly string[]): Promise<void> {
  const executable = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
  await new Promise<void>((resolvePromise, reject) => {
    execFile(
      executable,
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
      { windowsHide: true },
      (error, _stdout, stderr) => {
        if (error === null) resolvePromise()
        else reject(new Error(`styles: Agent Layer command failed: ${stderr.trim() || error.message}`))
      },
    )
  })
}

/** Filesystem owner for Style Method packages beneath one configured Vault. */
export class StyleStore {
  private readonly vaultRoot: string
  private readonly stylesRoot: string

  constructor(vaultRoot: string) {
    this.vaultRoot = resolve(vaultRoot)
    this.stylesRoot = join(this.vaultRoot, 'Agents', '5 Methods', 'Styles')
  }

  async list(): Promise<readonly StyleRecord[]> {
    await this.assertVault()
    await mkdir(this.stylesRoot, { recursive: true })
    const root = await realpath(this.stylesRoot)
    const entries = await readdir(root, { withFileTypes: true })
    const records: StyleRecord[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = await realpath(join(root, entry.name))
      if (!isWithin(root, directory)) throw new Error('styles: package escapes Styles root')
      try { records.push(recordOf(directory, await readFile(join(directory, ARTIFACT), 'utf8'))) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
    }
    return records.sort((left, right) => left.name.localeCompare(right.name))
  }

  async create(input: StyleDraft): Promise<StyleRecord> {
    const draft = validateDraft(input)
    await this.beforeMutation()
    const directory = join(this.stylesRoot, draft.name)
    await mkdir(directory)
    const id = `style-${randomUUID()}`
    await this.writeAtomic(join(directory, ARTIFACT), artifactText(id, draft, new Date().toISOString().slice(0, 10)))
    await this.rebuild()
    return recordOf(directory, await readFile(join(directory, ARTIFACT), 'utf8'))
  }

  async update(id: string, input: StyleDraft): Promise<StyleRecord> {
    const draft = validateDraft(input)
    await this.beforeMutation()
    const artifact = await this.find(id)
    const created = field(artifact.data, 'created') || new Date().toISOString().slice(0, 10)
    let directory = artifact.directory
    if (draft.name !== basename(directory)) {
      const destination = join(this.stylesRoot, draft.name)
      await access(destination).then(() => {
        throw new Error('styles: a Style with this name already exists')
      }).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      })
      await rename(directory, destination)
      directory = destination
    }
    await this.writeAtomic(join(directory, ARTIFACT), artifactText(id, draft, created))
    await this.rebuild()
    return recordOf(directory, await readFile(join(directory, ARTIFACT), 'utf8'))
  }

  async remove(id: string): Promise<void> {
    await this.beforeMutation()
    const artifact = await this.find(id)
    const files = await readdir(artifact.directory)
    if (files.length !== 1 || files[0] !== ARTIFACT) throw new Error('styles: package contains unmanaged files and cannot be deleted')
    await rm(join(artifact.directory, ARTIFACT))
    await rmdir(artifact.directory)
    await this.rebuild()
  }

  private async find(id: string): Promise<ParsedArtifact> {
    for (const record of await this.list()) {
      if (record.id !== id) continue
      const directory = join(this.stylesRoot, record.name)
      const text = await readFile(join(directory, ARTIFACT), 'utf8')
      return { data: parseFrontmatter(text), directory }
    }
    throw new Error(`styles: Style not found: ${id}`)
  }

  private async assertVault(): Promise<void> {
    const schema = join(this.vaultRoot, 'Agents', 'Artifact Schema v1.md')
    const info = await stat(schema).catch(() => undefined)
    if (info === undefined || !info.isFile()) throw new Error('styles: configured path is not an Agent Layer Vault')
  }

  private async beforeMutation(): Promise<void> {
    await this.assertVault()
    const guard = join(this.vaultRoot, 'Workspace', 'Projects', 'Central Hub', 'Sync', 'Invoke-VaultSyncGuard.ps1')
    await runPowerShell(guard, ['-Mode', 'Assert'])
    await mkdir(this.stylesRoot, { recursive: true })
  }

  private async rebuild(): Promise<void> {
    await runPowerShell(join(this.vaultRoot, 'Agents', 'Tools', 'AgentLayer.ps1'), ['rebuild'])
  }

  private async writeAtomic(path: string, text: string): Promise<void> {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, path)
  }
}
