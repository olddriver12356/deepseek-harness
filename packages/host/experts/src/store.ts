import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { ExpertDraft, ExpertRecord, ExpertStatus } from './types.ts'

const ARTIFACT = 'ARTIFACT.md'
const TITLE_PATTERN = /^[^<>:"/\\|?*\u0000-\u001f]+$/u
const STATUSES = new Set<ExpertStatus>(['draft', 'approved', 'suspended'])

interface ParsedArtifact {
  readonly data: Record<string, unknown>
  readonly directory: string
}

function field(data: Record<string, unknown>, key: string): string {
  return typeof data[key] === 'string' ? data[key] : ''
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function parseFrontmatter(text: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(text)
  if (match?.[1] === undefined) throw new Error('experts: ARTIFACT.md has invalid frontmatter')
  const data: Record<string, unknown> = {}
  for (const line of match[1].split(/\r?\n/u)) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const pair = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u.exec(line)
    if (pair?.[1] === undefined || pair[2] === undefined) throw new Error(`experts: unsupported frontmatter line: ${line}`)
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
  if (match?.[1] === undefined) throw new Error('experts: ARTIFACT.md has no Instructions section')
  return match[1].trim()
}

function recordOf(directory: string, text: string): ExpertRecord {
  const data = parseFrontmatter(text)
  const status = field(data, 'expert_status')
  if (data.artifact_type !== 'Method' || data.method_kind !== 'Expert' || !STATUSES.has(status as ExpertStatus)) {
    throw new Error(`experts: ${basename(directory)} is not a valid Expert Method`)
  }
  const name = field(data, 'title')
  if (name !== basename(directory)) throw new Error(`experts: title does not match package directory: ${name}`)
  return {
    id: field(data, 'id'),
    name,
    category: field(data, 'category'),
    description: field(data, 'description'),
    instructions: instructionsOf(text),
    status: status as ExpertStatus,
    model: field(data, 'model') || 'inherit',
    reasoning: field(data, 'reasoning') || 'inherit',
    permission: field(data, 'permission') || 'inherit',
    skills: stringList(data.skills),
    updatedAt: field(data, 'updated'),
  }
}

function validateDraft(input: ExpertDraft): ExpertDraft {
  const draft = {
    ...input,
    name: input.name.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    instructions: input.instructions.trim(),
    model: input.model.trim() || 'inherit',
    reasoning: input.reasoning.trim() || 'inherit',
    permission: input.permission.trim() || 'inherit',
    skills: [...new Set(input.skills.map(skill => skill.trim()).filter(Boolean))],
  }
  if (draft.name.length === 0 || draft.name.length > 80 || !TITLE_PATTERN.test(draft.name) || draft.name.endsWith('.') || draft.name.endsWith(' ')) {
    throw new Error('experts: name is not a valid package title')
  }
  if (draft.category.length === 0 || draft.category.length > 40
    || draft.description.length === 0 || draft.description.length > 180
    || draft.instructions.length === 0) {
    throw new Error('experts: category, description, and instructions are required')
  }
  if (!STATUSES.has(draft.status)) throw new Error('experts: invalid status')
  return draft
}

function frontmatter(data: Record<string, unknown>): string {
  const order = [
    'schema_version', 'id', 'title', 'artifact_type', 'method_kind', 'layer', 'status', 'expert_status',
    'owner_approved', 'topics', 'category', 'description', 'model', 'reasoning', 'permission', 'skills',
    'knowledge_scopes', 'tool_policy', 'created', 'updated', 'created_by', 'source_kind', 'provenance', 'derived_from',
  ]
  const keys = [...order.filter(key => key in data), ...Object.keys(data).filter(key => !order.includes(key)).sort()]
  return `---\n${keys.map(key => `${key}: ${JSON.stringify(data[key])}`).join('\n')}\n---\n`
}

function artifactText(id: string, draft: ExpertDraft, created: string): string {
  const now = new Date().toISOString()
  const data = {
    schema_version: 1,
    id,
    title: draft.name,
    artifact_type: 'Method',
    method_kind: 'Expert',
    layer: '5 Methods',
    status: 'active',
    expert_status: draft.status,
    owner_approved: draft.status === 'approved',
    topics: ['expert', draft.category.toLowerCase()],
    category: draft.category,
    description: draft.description,
    model: draft.model,
    reasoning: draft.reasoning,
    permission: draft.permission,
    skills: draft.skills,
    knowledge_scopes: [],
    tool_policy: 'inherit',
    created,
    updated: now.slice(0, 10),
    created_by: 'DSH Experts UI',
    source_kind: 'owner_input',
    provenance: { body_section: 'Provenance record' },
    derived_from: [],
  }
  const event = JSON.stringify({ event_id: `expert-${randomUUID()}`, event_type: 'expert_saved', at: now })
  const provenance = JSON.stringify({ source_kind: 'owner_input', original_statement: 'Created in DSH Experts UI', captured_at: now, origin_run: 'dsh-experts-ui' })
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
        else reject(new Error(`experts: Agent Layer command failed: ${stderr.trim() || error.message}`))
      },
    )
  })
}

/** Filesystem owner for Expert Method packages beneath one configured Vault. */
export class ExpertStore {
  private readonly vaultRoot: string
  private readonly expertsRoot: string

  constructor(vaultRoot: string) {
    this.vaultRoot = resolve(vaultRoot)
    this.expertsRoot = join(this.vaultRoot, 'Agents', '5 Methods', 'Experts')
  }

  async list(): Promise<readonly ExpertRecord[]> {
    await this.assertVault()
    await mkdir(this.expertsRoot, { recursive: true })
    const root = await realpath(this.expertsRoot)
    const entries = await readdir(root, { withFileTypes: true })
    const records: ExpertRecord[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = await realpath(join(root, entry.name))
      if (!isWithin(root, directory)) throw new Error('experts: package escapes Experts root')
      try { records.push(recordOf(directory, await readFile(join(directory, ARTIFACT), 'utf8'))) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
    }
    return records.sort((left, right) => left.name.localeCompare(right.name))
  }

  async create(input: ExpertDraft): Promise<ExpertRecord> {
    const draft = validateDraft(input)
    await this.beforeMutation()
    const directory = join(this.expertsRoot, draft.name)
    await mkdir(directory)
    const id = `agent-${randomUUID()}`
    await this.writeAtomic(join(directory, ARTIFACT), artifactText(id, draft, new Date().toISOString().slice(0, 10)))
    await this.rebuild()
    return recordOf(directory, await readFile(join(directory, ARTIFACT), 'utf8'))
  }

  async update(id: string, input: ExpertDraft): Promise<ExpertRecord> {
    const draft = validateDraft(input)
    await this.beforeMutation()
    const artifact = await this.find(id)
    const created = field(artifact.data, 'created') || new Date().toISOString().slice(0, 10)
    let directory = artifact.directory
    if (draft.name !== basename(directory)) {
      const destination = join(this.expertsRoot, draft.name)
      await access(destination).then(() => {
        throw new Error('experts: an Expert with this name already exists')
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
    if (files.length !== 1 || files[0] !== ARTIFACT) throw new Error('experts: package contains unmanaged files and cannot be deleted')
    await rm(join(artifact.directory, ARTIFACT))
    await rmdir(artifact.directory)
    await this.rebuild()
  }

  private async find(id: string): Promise<ParsedArtifact> {
    for (const record of await this.list()) {
      if (record.id !== id) continue
      const directory = join(this.expertsRoot, record.name)
      const text = await readFile(join(directory, ARTIFACT), 'utf8')
      return { data: parseFrontmatter(text), directory }
    }
    throw new Error(`experts: Expert not found: ${id}`)
  }

  private async assertVault(): Promise<void> {
    const schema = join(this.vaultRoot, 'Agents', 'Artifact Schema v1.md')
    if (!(await stat(schema)).isFile()) throw new Error('experts: configured path is not an Agent Layer Vault')
  }

  private async beforeMutation(): Promise<void> {
    await this.assertVault()
    const guard = join(this.vaultRoot, 'Workspace', 'Projects', 'Central Hub', 'Sync', 'Invoke-VaultSyncGuard.ps1')
    await runPowerShell(guard, ['-Mode', 'Assert'])
    await mkdir(this.expertsRoot, { recursive: true })
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
