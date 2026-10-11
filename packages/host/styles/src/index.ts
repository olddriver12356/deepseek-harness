/** Host Remote for Vault-backed Agent Layer Style Methods. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { StyleStore } from './store.ts'
import type { StyleCreateRequest, StyleDeleteRequest, StyleDeleteValue, StyleRecord, StyleUpdateRequest } from './types.ts'

export type * from './types.ts'

/**
 * Vault root containing the authoritative Style packages.
 */
export interface Config {
  /** Absolute or cwd-relative root of the Vault containing Agents/Artifact Schema v1.md. */
  readonly vaultRoot: string
}
export const Config: z<Config> = z.object({ vaultRoot: z.string().required() })

/**
 * Serialized human-facing operations over Vault-backed Styles.
 */
export class StyleService extends TypertRemoteService {
  private readonly store: StyleStore
  private operations: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'styles')
    this.store = new StyleStore(config.vaultRoot)
  }

  /**
   * Read the authoritative Style roster.
   * @returns Validated Vault-backed Style records.
   */
  @Remote('list')
  list(): Promise<readonly StyleRecord[]> { return this.store.list() }

  /**
   * Serialize creation of a guarded Style artifact.
   * @param request - Owner-supplied Style draft.
   * @returns Saved Style record.
   */
  @Remote('create')
  create(request: StyleCreateRequest): Promise<StyleRecord> { return this.mutate(() => this.store.create(request.style)) }

  /**
   * Serialize replacement of a guarded Style artifact.
   * @param request - Stable identity and replacement Style draft.
   * @returns Updated Style record.
   */
  @Remote('update')
  update(request: StyleUpdateRequest): Promise<StyleRecord> { return this.mutate(() => this.store.update(request.id, request.style)) }

  /**
   * Serialize removal of a Style package without unmanaged files.
   * @param request - Style identity selected for removal.
   * @returns Deletion receipt.
   */
  @Remote('delete')
  async delete(request: StyleDeleteRequest): Promise<StyleDeleteValue> {
    await this.mutate(() => this.store.remove(request.id))
    return { deleted: true }
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation)
    this.operations = result.then(() => undefined, () => undefined)
    return result
  }
}

export default StyleService
