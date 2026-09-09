import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable identity in the Vault's Agent Artifact Schema v1. */
export type KnowledgeId = string & Branded<'KnowledgeId'>
export type KnowledgeWorkflow = 'pending' | 'processing' | 'processed' | 'shelved' | 'failed' | 'awaiting-review' | 'accepted' | 'rejected'
export interface KnowledgeRecord {
  readonly id: KnowledgeId
  readonly title: string
  readonly layer: '1 Intake' | '2 AI Processing' | '3 Knowledge'
  readonly status: string
  readonly updatedAt: string
  readonly topics: readonly string[]
  readonly derivedFrom: readonly { readonly id: string; readonly link: string }[]
  readonly path: string
  readonly workflow: KnowledgeWorkflow
  readonly revision: string
}
export interface KnowledgeDocument extends KnowledgeRecord {
  readonly markdown: string
  readonly evidence: string
  readonly content: string
}
export interface KnowledgeReadRequest { readonly id: KnowledgeId }
export interface KnowledgeSaveRequest { readonly sessionId: SessionId; readonly title: string }
/** Save caller-supplied text as Intake evidence; sourceUrl is the stable capture identity. */
export interface KnowledgeSaveTextRequest {
  readonly sourceUrl: string
  /** Feed or site that published the article; the provenance gate requires an author or publisher. */
  readonly publisher: string
  /** ISO 8601 time the feed was fetched, not the time the owner clicked capture. */
  readonly retrievedAt: string
  readonly title: string
  readonly content: string
}

/** External-source provenance the bridge needs to satisfy the provenance_valid gate. */
export interface KnowledgeNewsSource {
  readonly kind: 'news'
  readonly canonicalUrl: string
  readonly publisher: string
  readonly retrievedAt: string
}
export interface KnowledgeReviewRequest extends KnowledgeReadRequest {
  readonly revision: string
  readonly decision: 'accept' | 'reject'
  readonly rationale: string
  readonly gates: readonly string[]
}
export interface KnowledgePreviewRequest extends KnowledgeReadRequest { readonly destination: string }
export interface KnowledgePromotionPreview extends KnowledgePreviewRequest {
  readonly before: string
  readonly after: string
  readonly token: string
}
export interface KnowledgePromoteRequest extends KnowledgePreviewRequest { readonly token: string; readonly approved: boolean }
export interface KnowledgeShelveRequest extends KnowledgeReadRequest { readonly revision: string; readonly shelved: boolean }
