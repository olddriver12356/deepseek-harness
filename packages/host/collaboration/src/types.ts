/** Type-only V1a discussion requests, results, and durable data. */
import type { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { HumanControlAdmission } from './authority.ts'
import type { actorSchema, collaborationStateSchema, connectionSchema, discussionOperationSchema, journalSchema, outboxSchema, receiptSchema, registrationSchema, stateLimitsSchema } from './schema.ts'

/** Persistent bidirectional pair identifier. */
export type ConnectionId = Branded<'CollaborationConnectionId'>
/** Durable peer-message identifier. */
export type PeerMessageId = Branded<'CollaborationPeerMessageId'>
/** Caller request identifier, scoped by the Host-derived actor. */
export type CollaborationRequestId = Branded<'CollaborationRequestId'>
/** Display-only independent-session registration. */
export type Registration = z.infer<typeof registrationSchema>
/** Human-granted pair, disclosure, and persistent activation budget. */
export type Connection = z.infer<typeof connectionSchema>
/** Peer delivery settlement retained after disconnect. */
export type OutboxMessage = z.infer<typeof outboxSchema>
/** Identity derived by the Host adapter; never accepted from request JSON. */
export type CollaborationActor = z.infer<typeof actorSchema>
/** One ordered committed operation. */
export type JournalEntry = z.infer<typeof journalSchema>
/** Original mutation result for an actor-scoped retry. */
export type RequestReceipt = z.infer<typeof receiptSchema>
/** Single authoritative record for all V1a discussion state. */
export type CollaborationState = z.infer<typeof collaborationStateSchema>
/** Validated persisted-size and retention capacities. */
export type StateLimits = z.infer<typeof stateLimitsSchema>
/** V1a operations; task authority and enrollment are absent. */
export type DiscussionOperation = z.infer<typeof discussionOperationSchema>
/** Trusted metadata passed separately from validated request data. */
export interface DiscussionContext {
  /** Adapter-derived acting session or internal delivery worker identity. */
  readonly actor: CollaborationActor
  /** Host clock timestamp for this operation. */
  readonly timestamp: string
  /** Stable actor-scoped request key, when the caller supports retries. */
  readonly requestId?: CollaborationRequestId
  /** Non-JSON human capability required for registration and grant controls. */
  readonly admission?: HumanControlAdmission
}
