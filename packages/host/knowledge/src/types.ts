import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Stable identity in the Vault's Agent Artifact Schema v1. */
export type KnowledgeId = string & Branded<'KnowledgeId'>
/**
 * Durable processing and review states of an Agent Layer artifact.
 */
export type KnowledgeWorkflow = 'pending' | 'processing' | 'processed' | 'shelved' | 'failed' | 'awaiting-review' | 'accepted' | 'rejected'
/**
 * Artifact identity, revision, review state, and source links without captured content.
 */
export interface KnowledgeRecord {
  readonly reviewed?: boolean
  readonly learned?: boolean
  readonly source?: string
  readonly suggestedDestination?: string
  readonly publishedTo?: string
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
/**
 * Artifact metadata with readable content and explicitly requested raw evidence.
 */
export interface KnowledgeDocument extends KnowledgeRecord {
  readonly markdown: string
  readonly evidence: string
  readonly content: string
}
/**
 * Stable Agent Layer artifact identity.
 */
export interface KnowledgeReadRequest { readonly id: KnowledgeId }
/**
 * Session and title selected for Intake capture.
 */
export interface KnowledgeSaveRequest { readonly sessionId: SessionId; readonly title: string }
/** Save caller-supplied text as Intake evidence; sourceUrl is the stable capture identity. */
export interface KnowledgeSaveTextRequest {
  readonly sourceUrl: string
  /** Feed or site that published the article; the source-validation gate requires an author or publisher. */
  readonly publisher: string
  /** ISO 8601 time the feed was fetched, not the time the owner clicked capture. */
  readonly retrievedAt: string
  readonly title: string
  readonly content: string
}

/** External source metadata required by the Vault bridge source-validation gate. */
export interface KnowledgeNewsSource {
  readonly kind: 'news'
  readonly canonicalUrl: string
  readonly publisher: string
  readonly retrievedAt: string
}
/**
 * Revision-bound owner review with optional rationale and gates.
 */
export interface KnowledgeReviewRequest extends KnowledgeReadRequest {
  readonly revision: string
  readonly decision: 'accept' | 'reject'
  readonly rationale?: string
  readonly gates?: readonly string[]
}
/**
 * Artifact and exact Vault destination selected for a publication preview.
 */
export interface KnowledgePreviewRequest extends KnowledgeReadRequest { readonly destination: string }
/**
 * Before and after content with an approval token binding the proposed publication.
 */
export interface KnowledgePromotionPreview extends KnowledgePreviewRequest {
  readonly before: string
  readonly after: string
  readonly token: string
}
/**
 * Explicit approval of the preview for an artifact and destination.
 */
export interface KnowledgePromoteRequest extends KnowledgePreviewRequest { readonly token: string; readonly approved: boolean }
/**
 * Revision-bound request to shelve or restore an artifact.
 */
export interface KnowledgeShelveRequest extends KnowledgeReadRequest { readonly revision: string; readonly shelved: boolean }
/**
 * Revision-bound owner learning state without publication authority.
 */
export interface KnowledgeLearnRequest extends KnowledgeReadRequest { readonly revision: string; readonly learned: boolean }
/**
 * Directly requested concept content and a suggested existing publication destination.
 */
export interface KnowledgeDirectRequest {
  readonly title: string
  readonly content: string
  readonly tags: readonly string[]
  readonly suggestedDestination: string
}
