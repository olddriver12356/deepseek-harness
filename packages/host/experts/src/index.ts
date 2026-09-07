/** Host Remote for Vault-backed Agent Layer Expert Methods. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { ExpertStore } from './store.ts'
import type { ExpertCreateRequest, ExpertDeleteRequest, ExpertDeleteValue, ExpertRecord, ExpertUpdateRequest } from './types.ts'

export type * from './types.ts'

export interface Config {
  /** Absolute or cwd-relative root of the Vault containing Agents/Artifact Schema v1.md. */
  readonly vaultRoot: string
}
export const Config: z<Config> = z.object({ vaultRoot: z.string().required() })

export class ExpertService extends TypertRemoteService {
  private readonly store: ExpertStore
  private operations: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'experts')
    this.store = new ExpertStore(config.vaultRoot)
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
