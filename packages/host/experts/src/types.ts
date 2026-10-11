/** Wire-safe Agent Layer Expert vocabulary. */
export type ExpertStatus = 'draft' | 'approved' | 'suspended'
/** How a dispatched Expert executes: injected into the current Session, or as a forked child. */
export type ExpertExecution = 'conversational' | 'delegated'
/**
 * Vault-backed Expert content with stable identity and approval state.
 */
export interface ExpertRecord {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly description: string
  readonly instructions: string
  readonly status: ExpertStatus
  readonly execution: ExpertExecution
  readonly model: string
  readonly reasoning: string
  /** Missing legacy values resolve to read-only fresh-context delegation. */
  readonly access?: 'read-only' | 'write'
  readonly contextMode?: 'fresh' | 'fork'
  readonly updatedAt: string
}
/**
 * Expert content supplied before its identity and update date are assigned.
 */
export interface ExpertDraft extends Omit<ExpertRecord, 'id' | 'updatedAt'> {}
/**
 * New Expert draft submitted by the owner.
 */
export interface ExpertCreateRequest { readonly expert: ExpertDraft }
/**
 * Existing Expert identity and replacement draft.
 */
export interface ExpertUpdateRequest { readonly id: string; readonly expert: ExpertDraft }
/**
 * Explicit Expert identity selected for removal.
 */
export interface ExpertDeleteRequest { readonly id: string }
/**
 * Receipt returned after the selected Expert is removed.
 */
export interface ExpertDeleteValue { readonly deleted: true }
