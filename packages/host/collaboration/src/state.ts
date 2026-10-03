/** Pure V1a pair, outbox, activation, and journal transitions; no task authority. */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { requireHumanControl } from './authority.ts'
import { collaborationStateSchema } from './schema.ts'
import type { CollaborationActor, CollaborationRequestId, CollaborationState, Connection, DiscussionContext, DiscussionOperation, RequestReceipt } from './types.ts'

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
  let registrations = state.registrations
  let connections = state.connections
  let outbox = state.outbox
  const human = () => {
    requireHumanControl(context.admission)
    if (context.actor.kind !== 'human') invalid('human controls require a Host-derived human actor')
  }
  const pair = (id: Connection['id']) => {
    const value = connections.find(row => row.id === id)
    if (value === undefined) invalid('connection is absent; add the peer again')
    return value
  }
  const register = (registration: (typeof registrations)[number]) => {
    registrations = [...registrations.filter(row => row.sessionId !== registration.sessionId), registration]
  }
  const connect = (connection: Connection) => {
    if (connection.budget.used !== 0) invalid('a new connection must begin with zero used activations')
    if (connections.some(row => row.id === connection.id || connection.sessions.every(id => row.sessions.includes(id)))
      || state.journal.some(entry => 'connection' in entry.data && entry.data.connection.id === connection.id)) invalid('connection id was already used, or session pair already exists')
    connections = [...connections, connection]
  }
  const replacePair = (next: Connection) => { connections = connections.map(row => row.id === next.id ? next : row) }
  switch (operation.kind) {
    case 'register':
      human(); register(operation.registration)
      break
    case 'connect':
      human(); connect(operation.connection)
      break
    case 'add-peer': {
      human()
      if (context.actor.kind !== 'human' || context.actor.sessionId !== operation.connection.sessions[0]) {
        invalid('add-peer initiator must be the Host-derived human session')
      }
      if (!operation.connection.sessions.every(id => operation.registrations.some(row => row.sessionId === id))) {
        invalid('add-peer display registrations must name the exact connection endpoints')
      }
      for (const registration of operation.registrations) register(registration)
      connect(operation.connection)
      break
    }
    case 'disconnect':
      human(); pair(operation.connectionId)
      connections = connections.filter(row => row.id !== operation.connectionId)
      outbox = outbox.map(row => row.connectionId === operation.connectionId && row.state === 'queued' ? { ...row, state: 'cancelled' as const } : row)
      break
    case 'pause':
      human(); replacePair({ ...pair(operation.connectionId), paused: operation.paused })
      break
    case 'grants':
      human(); replacePair({ ...pair(operation.connectionId), grants: operation.grants })
      break
    case 'budget': {
      human()
      const connection = pair(operation.connectionId)
      if (operation.limit < connection.budget.used) invalid('budget cannot be lower than already charged activations')
      replacePair({ ...connection, budget: { ...connection.budget, limit: operation.limit } })
      break
    }
    case 'enqueue': {
      const message = operation.message
      const connection = pair(message.connectionId)
      if (context.actor.kind !== 'session' || context.actor.sessionId !== message.sender) invalid('message sender must be the Host-derived acting session')
      if (connection.paused) invalid('connection is paused')
      if (!connection.sessions.includes(message.sender) || !connection.sessions.includes(message.recipient)) invalid('message endpoints must belong to the connection')
      if (message.state !== 'queued' || message.activationReserved !== undefined || outbox.some(row => row.id === message.id)) invalid('new messages require a unique id, queued state, and no activation reservation')
      outbox = [...outbox, message]
      break
    }
    case 'reserve-activation': {
      if (context.actor.kind !== 'system') invalid('activation reservation requires the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || message.state !== 'queued' || message.activationReserved !== undefined) invalid('only queued messages without a reservation may charge activation')
      const connection = pair(message.connectionId)
      if (connection.paused) invalid('connection is paused')
      if (connection.budget.used >= connection.budget.limit) invalid('activation budget exhausted; a human must increase the limit')
      replacePair({ ...connection, budget: { ...connection.budget, used: connection.budget.used + 1 } })
      outbox = outbox.map(row => row.id === message.id ? { ...row, activationReserved: true as const } : row)
      break
    }
    case 'admit': {
      if (context.actor.kind !== 'system') invalid('delivery admission requires the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || message.state !== 'queued' || message.activationReserved !== true) invalid('only queued messages with a reservation may be admitted')
      if (pair(message.connectionId).paused) invalid('connection is paused')
      outbox = outbox.map(row => row.id === message.id ? { ...row, state: 'admitted' as const } : row)
      break
    }
    case 'settle': {
      if (context.actor.kind !== 'system') invalid('delivery settlement requires the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || message.state !== 'queued') invalid('only queued messages may be cancelled or failed')
      outbox = outbox.map(row => row.id === message.id ? { ...row, state: operation.state } : row)
      break
    }
    default:
      return assertNever(operation)
  }
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
