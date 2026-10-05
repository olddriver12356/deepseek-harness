/** Internal pure operation reducer shared by live transitions and durable journal reconciliation. */
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { assertNever } from '@deepseek-ai/dsh-util-values'
import type { CollaborationActor, Connection, DiscussionOperation, JournalEntry, OutboxMessage, Registration } from './types.ts'

interface DiscussionRecords {
  readonly registrations: readonly Registration[]
  readonly connections: readonly Connection[]
  readonly outbox: readonly OutboxMessage[]
  readonly journal: readonly JournalEntry[]
}

/**
 * Reduce one validated operation without minting admission or publishing state.
 * Live callers separately enforce the private human capability; persisted replay checks recorded actor and operation consistency.
 * @param state - records produced by the preceding contiguous journal prefix.
 * @param operation - validated operation data.
 * @param actor - live Host identity or persisted journal identity.
 * @returns registrations, pairs and outbox resulting from this operation.
 */
export function reduceDiscussionOperation(
  state: DiscussionRecords, operation: DiscussionOperation, actor: CollaborationActor,
): Pick<DiscussionRecords, 'registrations' | 'connections' | 'outbox'> {
  let registrations = state.registrations
  let connections = state.connections
  let outbox = state.outbox
  const human = () => {
    if (actor.kind !== 'human') invalid('human controls require a Host-derived human actor')
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
    if (connection.sessions.some(id => !registrations.some(row => row.sessionId === id))) invalid('connection member is unregistered')
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
      if (actor.kind !== 'human' || actor.sessionId !== operation.connection.sessions[0]) {
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
      if (actor.kind !== 'session' || actor.sessionId !== message.sender) invalid('message sender must be the Host-derived acting session')
      if (connection.paused) invalid('connection is paused')
      if (!connection.sessions.includes(message.sender) || !connection.sessions.includes(message.recipient)) invalid('message endpoints must belong to the connection')
      if (message.state !== 'queued' || message.activationReserved !== undefined || message.deliveryReason !== undefined || outbox.some(row => row.id === message.id)) invalid('new messages require a unique id, queued state, and no activation reservation or delivery diagnostic')
      outbox = [...outbox, message]
      break
    }
    case 'reserve-activation': {
      if (actor.kind !== 'system') invalid('activation reservation requires the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || message.state !== 'queued' || message.activationReserved !== undefined) invalid('only queued messages without a reservation may charge activation')
      const connection = pair(message.connectionId)
      if (connection.paused) invalid('connection is paused')
      if (connection.budget.used >= connection.budget.limit) invalid('activation budget exhausted; a human must increase the limit')
      replacePair({ ...connection, budget: { ...connection.budget, used: connection.budget.used + 1 } })
      outbox = outbox.map((row) => {
        if (row.id !== message.id) return row
        const { deliveryReason, ...retained } = row
        return { ...retained, activationReserved: true as const,
          ...(deliveryReason === undefined ? {} : { deliveryReason }) }
      })
      break
    }
    case 'admit': {
      if (actor.kind !== 'system') invalid('delivery admission requires the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || message.state !== 'queued' || message.activationReserved !== true) invalid('only queued messages with a reservation may be admitted')
      if (pair(message.connectionId).paused) invalid('connection is paused')
      outbox = outbox.map((row) => {
        if (row.id !== message.id) return row
        const { deliveryReason: _reason, ...retained } = row
        return { ...retained, state: 'admitted' as const }
      })
      break
    }
    case 'delivery-status': {
      if (actor.kind !== 'system') invalid('delivery diagnostics require the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || (message.state !== 'queued' && message.state !== 'admitted')) invalid('only pending deliveries may be blocked')
      outbox = outbox.map((row) => {
        if (row.id !== message.id) return row
        const { deliveryReason: _reason, ...retained } = row
        return { ...retained, ...(operation.deliveryReason === undefined ? {} : { deliveryReason: operation.deliveryReason }) }
      })
      break
    }
    case 'settle': {
      if (actor.kind !== 'system') invalid('delivery settlement requires the Host delivery worker')
      const message = outbox.find(row => row.id === operation.messageId)
      if (message === undefined || (message.state !== 'queued' && message.state !== 'admitted')) invalid('only pending deliveries may be cancelled or failed')
      if (message.state === 'admitted' && (operation.state !== 'failed' || operation.deliveryReason !== 'input-refused')) {
        invalid('only queued messages may be cancelled; admitted failure requires terminal input refusal')
      }
      outbox = outbox.map(row => row.id === message.id ? { ...row, state: operation.state,
        ...(operation.deliveryReason === undefined ? {} : { deliveryReason: operation.deliveryReason }) } : row)
      break
    }
    default:
      return assertNever(operation)
  }
  return { registrations, connections, outbox }
}

function invalid(reason: string): never {
  throw new RemoteError('collaboration/invalid-operation', reason, { reason })
}
