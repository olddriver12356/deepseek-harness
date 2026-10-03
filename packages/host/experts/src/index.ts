/** Host Remote for Vault-backed Agent Layer Expert Methods. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { expertPolicyOf, installExpertPolicy, type ExpertPolicy } from './policy.ts'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ExpertStore } from './store.ts'
import type {
  ExpertCreateRequest,
  ExpertDeleteRequest,
  ExpertDeleteValue,
  ExpertRecord,
  ExpertUpdateRequest,
} from './types.ts'

export type * from './types.ts'

export interface Config {
  /** Absolute or cwd-relative root of the Vault containing Agents/Artifact Schema v1.md. */
  readonly vaultRoot: string
  readonly maxConcurrent?: number
  readonly readOnlyTools?: string[]
  readonly writeTools?: string[]
}
export const Config: z<Config> = z.object({
  vaultRoot: z.string().required(),
  maxConcurrent: z.number().min(1).step(1).default(2),
  readOnlyTools: z.array(z.string()).default(['read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch']),
  writeTools: z.array(z.string()).default(['write', 'edit', 'bash', 'pwsh', 'job_output', 'job_kill']),
})

declare module '@deepseek-ai/cordis' {
  interface Context { experts: ExpertService }
}

export class ExpertService extends TypertRemoteService {
  static inject = ['agents', 'tools', 'sessionProjections']
  private readonly store: ExpertStore
  private operations: Promise<void> = Promise.resolve()
  private readonly pending = new Map<SessionId, ExpertPolicy>()
  private readonly pendingParents = new Map<SessionId, SessionId>()
  private readonly config: Config

  constructor(ctx: Context, config: Config) {
    super(ctx, 'experts')
    this.store = new ExpertStore(config.vaultRoot)
    this.config = config
    installExpertPolicy(ctx, this.pending)
  }

  /** Reserve one child before publication; returned cleanup releases startup admission only. */
  reserveDelegation(parent: Agent, childId: SessionId, expert: ExpertRecord): () => void {
    if (parent.session.header.parentSession !== undefined) throw new Error('experts: only a top-level agent may delegate experts')
    const active = new Set([...this.pendingParents].filter(([, id]) => id === parent.id).map(([id]) => id))
    for (const child of this.ctx.agents.list()) {
      if (child.session.header.parentSession === parent.id && child.status === 'running' && expertPolicyOf(this.ctx, child) !== undefined) active.add(child.id)
    }
    if (active.size >= (this.config.maxConcurrent ?? 2)) throw new Error('experts: concurrent delegation limit reached; wait for a running expert')
    const available = parent.ctx.tools.schemas(parent).map(tool => tool.name)
    const access = expert.access ?? 'read-only'
    const readable = this.config.readOnlyTools ?? ['read', 'read_image', 'glob', 'grep', 'web_search', 'web_fetch']
    const writable = this.config.writeTools ?? ['write', 'edit', 'bash', 'pwsh', 'job_output', 'job_kill']
    const allowedTools = [...new Set(access === 'read-only' ? readable : [...readable, ...writable])]
      .filter(name => available.includes(name))
    this.pending.set(childId, { childId, expertId: expert.id, access, allowedTools })
    this.pendingParents.set(childId, parent.id)
    return () => { this.pending.delete(childId); this.pendingParents.delete(childId) }
  }

  @Remote('list')
  list(): Promise<readonly ExpertRecord[]> { return this.store.list() }

  @Remote('create')
  create(request: ExpertCreateRequest): Promise<ExpertRecord> { return this.mutate(() => this.store.create(request.expert)) }

  @Remote('update')
  update(request: ExpertUpdateRequest): Promise<ExpertRecord> { return this.mutate(() => this.store.update(request.id, request.expert)) }

  @Remote('delete')
  async delete(request: ExpertDeleteRequest): Promise<ExpertDeleteValue> {
    await this.mutate(() => this.store.remove(request.id))
    return { deleted: true }
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation)
    this.operations = result.then(() => undefined, () => undefined)
    return result
  }
}

export default ExpertService
