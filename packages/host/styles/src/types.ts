/** Wire-safe Agent Layer Style vocabulary. */
export type StyleStatus = 'draft' | 'approved' | 'suspended'
export interface StyleRecord {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly instructions: string
  readonly status: StyleStatus
  readonly updatedAt: string
}
export interface StyleDraft extends Omit<StyleRecord, 'id' | 'updatedAt'> {}
export interface StyleCreateRequest { readonly style: StyleDraft }
export interface StyleUpdateRequest { readonly id: string; readonly style: StyleDraft }
export interface StyleDeleteRequest { readonly id: string }
export interface StyleDeleteValue { readonly deleted: true }
