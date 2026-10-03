/**
 * Opt-in Host plugin for human-authorized peer discussion between independently owned sessions.
 * This entry installs turn authority and owns the V1a durable discussion aggregate.
 * @module @deepseek-ai/dsh-host-collaboration
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installCollaborationAuthority, peerDiscussionToolNames } from './authority.ts'
import { CollaborationStore } from './store.ts'
import { CollaborationRemote } from './remote.ts'
import type { StateLimits } from './types.ts'

export { CollaborationStore } from './store.ts'
export { CollaborationRemote } from './remote.ts'
export type { AddPeerRequest, PeerControlRequest, PeerBudgetRequest, CollaborationViewRequest, CollaborationSnapshot, CollaborationMutationResult } from './types.ts'
export { applyDiscussionOperation, emptyCollaborationState, findRequestReceipt } from './state.ts'
export { collaborationStateSchema, discussionOperationSchema } from './schema.ts'
export type { CollaborationState, CollaborationActor, CollaborationRequestId, Connection, ConnectionId, DiscussionContext, DiscussionOperation, JournalEntry, OutboxMessage, PeerMessageId, Registration, RequestReceipt, StateLimits } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    collaborationStore: CollaborationStore
  }
}

export { requireCollaborationAuthority } from './authority.ts'

export type { HumanControlAdmission, HumanControlScope, TurnClass } from './authority.ts'

/** Plugin name for the Cordis loader. */
export const name = 'collaboration'

/** Services the plugin needs before it activates. */
export const inject = ['tools', 'storageDomain']

/** Validated plugin configuration. */
export interface Config {
  /** Reviewed read and collaboration tools a peer turn may call; other names fail loading. */
  readonly peerDiscussionTools: Array<(typeof peerDiscussionToolNames)[number]>
  /** Explicit limits for complete durable aggregate bytes, journal entries, and retry receipts. */
  readonly stateLimits: StateLimits
}

/** Schema for {@link Config}; the default admits only the read-only file tools. */
export const Config: z<Config> = z.object({
  peerDiscussionTools: z.array(z.union([...peerDiscussionToolNames])).default(['read', 'glob', 'grep']),
  stateLimits: z.object({
    maxStateBytes: z.number().min(1).max(Number.MAX_SAFE_INTEGER).step(1).required(),
    maxJournalEntries: z.number().min(1).max(Number.MAX_SAFE_INTEGER).step(1).required(),
    maxRequests: z.number().min(1).max(Number.MAX_SAFE_INTEGER).step(1).required(),
  }).required(),
})

/**
 * Open durable discussion state and install turn authority for the plugin's lifetime.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 * @returns completion after state initialization; disposal drains admitted storage writes.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = await CollaborationStore.open(ctx.storageDomain, config.stateLimits)
  ctx.effect(() => () => store.close(), 'collaboration.store')
  ctx.provide('collaborationStore', store)
  ctx.effect(() => installCollaborationAuthority(ctx, { allowedTools: new Set(config.peerDiscussionTools) }), 'collaboration.authority')
  ctx.plugin(CollaborationRemote)
}
