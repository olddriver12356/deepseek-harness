/** Pure V1a pair, outbox, activation, and journal transitions; no task authority. */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { reduceDiscussionOperation } from './operation.ts'
import { requireHumanControl } from './authority.ts'
import { collaborationStateSchema } from './schema.ts'
import type { CollaborationActor, CollaborationRequestId, CollaborationState, DiscussionContext, DiscussionOperation, RequestReceipt } from './types.ts'

/**
 * Construct an empty aggregate with no ambient grants or activation allowance.
 * @returns immutable, schema-valid initial state.
 */
export function emptyCollaborationState(): CollaborationState {
  return collaborationStateSchema.parse({ revision: 0, registrations: [], connections: [], outbox: [], journal: [], requests: [] })
}

/**
 * Find a retry's original receipt before attempting a write, and after a revision conflict.
 * @param state - latest committed aggregate.
 * @param actor - Host-derived identity, which namespaces request keys.
 * @param requestId - caller's stable key.
 * @param operation - canonical validated data, when verifying an identical retry.
 * @returns the original result, or undefined if this actor has not committed the key.
 */
export function findRequestReceipt(
  state: CollaborationState, actor: CollaborationActor, requestId: CollaborationRequestId, operation?: DiscussionOperation,
): RequestReceipt | undefined {
  const receipt = state.requests.find(row => sameActor(row.actor, actor) && row.requestId === requestId)
  if (receipt !== undefined && operation !== undefined && JSON.stringify(receipt.operation) !== JSON.stringify(operation)) {
    throw new RemoteError('collaboration/request-conflict', 'The request key already names a different operation. Use a new request key.', { requestId })
  }
  return receipt
}

/**
 * Apply a validated operation with metadata derived separately by the Host adapter.
 * Human controls require the private non-JSON admission. Activation reservation charges the pair budget atomically.
 * Duplicate requests must be answered from findRequestReceipt without entering a transaction.
 * @param state - current immutable aggregate.
 * @param operation - validated mutation; contains no acting identity override.
 * @param context - trusted acting identity, clock, and optional human admission.
 * @returns next immutable aggregate including one journal entry and an optional original-result receipt.
 */
export function applyDiscussionOperation(
  state: CollaborationState, operation: DiscussionOperation, context: DiscussionContext,
): CollaborationState {
  if (context.requestId !== undefined && findRequestReceipt(state, context.actor, context.requestId, operation) !== undefined) {
    invalid('request already committed; return its original receipt without a write')
  }
  if (context.actor.kind === 'human') requireHumanControl(context.admission)
  const { registrations, connections, outbox } = reduceDiscussionOperation(state, operation, context.actor)
  const revision = state.revision + 1
  const result = {
    revision,
    ...('connectionId' in operation ? { connectionId: operation.connectionId }
      : 'connection' in operation ? { connectionId: operation.connection.id } : {}),
    ...('messageId' in operation ? { messageId: operation.messageId } : 'message' in operation ? { messageId: operation.message.id } : {}),
  }
  return collaborationStateSchema.parse({
    revision, registrations, connections, outbox,
    journal: [...state.journal, {
      revision, actor: context.actor, operation: operation.kind, data: operation, timestamp: context.timestamp,
    }],
    requests: context.requestId === undefined ? state.requests
      : [...state.requests, { actor: context.actor, requestId: context.requestId, operation, result }],
  })
}

function sameActor(a: CollaborationActor, b: CollaborationActor): boolean {
  return a.kind === b.kind && (a.kind === 'system' || b.kind !== 'system' && a.sessionId === b.sessionId)
}

function invalid(reason: string): never {
  throw new RemoteError('collaboration/invalid-operation', reason, { reason })
}
