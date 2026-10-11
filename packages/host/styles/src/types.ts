/** Wire-safe Agent Layer Style vocabulary. */
export type StyleStatus = 'draft' | 'approved' | 'suspended'
/**
 * Vault-backed Style content with stable identity and approval state.
 */
export interface StyleRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly status: StyleStatus
  readonly updatedAt: string
}
/**
 * Style content supplied before its identity and update date are assigned.
 */
export interface StyleDraft extends Omit<StyleRecord, 'id' | 'updatedAt'> {}
/**
 * New Style draft submitted by the owner.
 */
export interface StyleCreateRequest { readonly style: StyleDraft }
/**
 * Existing Style identity and replacement draft.
 */
export interface StyleUpdateRequest { readonly id: string; readonly style: StyleDraft }
/**
 * Explicit Style identity selected for removal.
 */
export interface StyleDeleteRequest { readonly id: string }
/**
 * Receipt returned after the selected Style is removed.
 */
export interface StyleDeleteValue { readonly deleted: true }
