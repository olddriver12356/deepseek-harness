/** Type-only V1a discussion requests, results, and durable data. */
import type { z } from 'zod'
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { HumanControlAdmission } from './authority.ts'
import type { peerSourceSchema, sendPeerRequestSchema } from './messages.ts'
import type { actorSchema, collaborationStateSchema, connectionSchema, discussionOperationSchema, journalSchema, outboxSchema, receiptSchema, registrationSchema, stateLimitsSchema } from './schema.ts'

/** Persistent bidirectional pair identifier. */
export type ConnectionId = Branded<'CollaborationConnectionId'>
/** Durable peer-message identifier. */
export type PeerMessageId = Branded<'CollaborationPeerMessageId'>
/** Validated model request; the Host separately derives its sender. */
export type SendPeerRequest = z.infer<typeof sendPeerRequestSchema>
/** Durable acceptance of one actor-scoped send, independent of eventual Agent completion. */
export interface MessageReceipt {
  readonly messageId: PeerMessageId
  readonly revision: number
  readonly state: 'queued'
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Explicitly attributed peer data with required discussion admission. */
    'collaboration-peer': z.infer<typeof peerSourceSchema>
  }
}
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

/** Stable optimistic mutation identity supplied by the authenticated UI. */
export interface CollaborationMutationRequest {
  /** Initiating ordinary Session; the Host verifies its stored identity. */
  readonly sessionId: SessionId
  /** Last committed aggregate revision observed by the UI. */
  readonly expectedRevision: number
  /** Original actor-scoped retry key; reuse only for identical intent. */
  readonly requestId: CollaborationRequestId
}

/** One sidebar gesture registering both Sessions and opening their discussion pair. */
export interface AddPeerRequest extends CollaborationMutationRequest {
  /** Other independently owned Session on this Host. */
  readonly peerSessionId: SessionId
  /** Human-supplied display title for the initiating Session. */
  readonly title: string
  /** Human-supplied display title for the peer Session. */
  readonly peerTitle: string
  /** Observed initiating workspace, compared with the stored header. */
  readonly cwd: string
  /** Observed peer workspace, compared with the stored header; it may differ from cwd. */
  readonly peerCwd: string
  /** UI confirms that it showed and the human accepted the disclosure warning. */
  readonly disclosureAccepted: true
  /** Explicit pair-specific access to collaboration records, never private Session history. */
  readonly grants: { readonly snapshot: boolean; readonly follow: boolean }
  /** Explicit maximum automatic activations for this pair, including zero. */
  readonly activationLimit: number
}

/** Human control over an existing pair containing the initiating Session. */
export interface PeerControlRequest extends CollaborationMutationRequest {
  /** Persistent pair to pause, resume, disconnect, or budget. */
  readonly connectionId: ConnectionId
}

/** Replace the activation allowance while preserving already charged activations. */
export interface PeerBudgetRequest extends PeerControlRequest {
  /** New total limit, at least the pair's charged count. */
  readonly limit: number
}

/** Browse collaboration records belonging to this ordinary Session. */
export interface CollaborationViewRequest {
  /** Ordinary stored Session whose pair grants filter the result. */
  readonly sessionId: SessionId
}

/** Complete filtered view; every follow item replaces the prior view, including after a revision gap. */
export interface CollaborationSnapshot {
  /** Global committed revision; gaps can also represent other Sessions' changes. */
  readonly revision: number
  /** Display registrations for exactly the currently authorized pair endpoints. */
  readonly registrations: readonly Registration[]
  /** Pairs containing the viewer with the requested snapshot or follow grant. */
  readonly connections: readonly Connection[]
  /** Messages of those pairs; contains no ordinary assistant or private human history. */
  readonly outbox: readonly OutboxMessage[]
}

/** Original durable mutation receipt; no later retry creates another revision. */
export type CollaborationMutationResult = RequestReceipt['result']

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Expected revision differs from the current durable aggregate. */
    'collaboration/revision-conflict': { readonly revision: number }
    /** Retained authority or messages exceed an explicitly configured limit. */
    'collaboration/capacity': { readonly limit: string; readonly maximum: number; readonly actual: number }
    /** The operation requires an active pair, valid delivery state, or available budget. */
    'collaboration/invalid-operation': { readonly reason: string }
    /** The same actor reused a committed request key for different operation data. */
    'collaboration/request-conflict': { readonly requestId: CollaborationRequestId }
    /** The collaboration store has begun disposal. */
    'collaboration/closed': Record<string, never>
  }
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** Unknown or subagent-owned Session cannot join independent discussion. */
    'collaboration/session-unavailable': { readonly sessionId: SessionId; readonly reason: string }
    /** Missing or stale workspace metadata; connecting distinct workspaces is supported. */
    'collaboration/workspace-mismatch': { readonly sessionId: SessionId; readonly actualCwd?: string }
    /** A human control references a pair belonging to other Sessions. */
    'collaboration/unauthorized': { readonly sessionId: SessionId }
  }
}
