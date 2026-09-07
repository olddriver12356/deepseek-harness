/** Wire-safe Agent Layer Expert vocabulary. */
export type ExpertStatus = 'draft' | 'approved' | 'suspended'
export interface ExpertRecord {
  readonly id: string
  readonly name: string
  readonly category: string
  readonly description: string
  readonly instructions: string
  readonly status: ExpertStatus
  readonly model: string
  readonly reasoning: string
  readonly permission: string
  readonly skills: readonly string[]
  readonly updatedAt: string
}
export interface ExpertDraft extends Omit<ExpertRecord, 'id' | 'updatedAt'> {}
export interface ExpertCreateRequest { readonly expert: ExpertDraft }
export interface ExpertUpdateRequest { readonly id: string; readonly expert: ExpertDraft }
export interface ExpertDeleteRequest { readonly id: string }
export interface ExpertDeleteValue { readonly deleted: true }
