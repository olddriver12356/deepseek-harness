/** Durable and request JSON validation for the single V1a collaboration aggregate. */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { CollaborationRequestId, ConnectionId, PeerMessageId } from './types.ts'

const identifier = z.string().min(1).regex(/^[^\u0000-\u001f\u007f]+$/)
/** Accepts opaque Session identifiers without imposing path or UUID semantics. */
export const sessionIdSchema = identifier.transform(value => SessionId(value))
/** Connection identifier JSON parser. */
export const connectionIdSchema = identifier.transform(value => brandString<ConnectionId>(value))
/** Peer message identifier JSON parser. */
export const peerMessageIdSchema = identifier.transform(value => brandString<PeerMessageId>(value))
/** Actor-scoped request key JSON parser. */
export const requestIdSchema = identifier.transform(value => brandString<CollaborationRequestId>(value))
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const timestamp = z.iso.datetime()
const grantsSchema = z.strictObject({ snapshot: z.boolean(), follow: z.boolean() }).readonly()

/** Display data contains no capability or participant role. */
export const registrationSchema = z.strictObject({ sessionId: sessionIdSchema, title: z.string(), cwd: z.string().min(1) }).readonly()
/** Pair grants never authorize task execution or another pair. */
export const connectionSchema = z.strictObject({
  id: connectionIdSchema,
  sessions: z.tuple([sessionIdSchema, sessionIdSchema]).readonly(),
  disclosureAccepted: z.literal(true),
  grants: grantsSchema,
  budget: z.strictObject({ limit: count, used: count }).readonly(),
  paused: z.boolean(),
}).refine(value => value.sessions[0] !== value.sessions[1] && value.budget.used <= value.budget.limit, 'invalid pair or activation budget').readonly()
/** Queued reservations are recoverable; admission means durable recipient input acceptance. */
export const outboxSchema = z.strictObject({
  id: peerMessageIdSchema, connectionId: connectionIdSchema,
  sender: sessionIdSchema, recipient: sessionIdSchema, text: z.string(),
  state: z.enum(['queued', 'admitted', 'cancelled', 'failed']),
  activationReserved: z.literal(true).optional(),
}).refine(value => value.sender !== value.recipient, 'sender and recipient must differ').readonly()
/** Journal actors come from the adapter, outside request JSON. */
export const actorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('human'), sessionId: sessionIdSchema }).readonly(),
  z.strictObject({ kind: z.literal('session'), sessionId: sessionIdSchema }).readonly(),
  z.strictObject({ kind: z.literal('system') }).readonly(),
])
/** Complete current-consumer mutation requests. */
export const discussionOperationSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('register'), registration: registrationSchema }),
  z.strictObject({ kind: z.literal('connect'), connection: connectionSchema }),
  z.strictObject({ kind: z.literal('add-peer'), registrations: z.tuple([registrationSchema, registrationSchema]).readonly(), connection: connectionSchema }),
  z.strictObject({ kind: z.literal('disconnect'), connectionId: connectionIdSchema }),
  z.strictObject({ kind: z.literal('pause'), connectionId: connectionIdSchema, paused: z.boolean() }),
  z.strictObject({ kind: z.literal('grants'), connectionId: connectionIdSchema, grants: grantsSchema }),
  z.strictObject({ kind: z.literal('budget'), connectionId: connectionIdSchema, limit: count }),
  z.strictObject({ kind: z.literal('enqueue'), message: outboxSchema }),
  z.strictObject({ kind: z.literal('reserve-activation'), messageId: peerMessageIdSchema }),
  z.strictObject({ kind: z.literal('admit'), messageId: peerMessageIdSchema }),
  z.strictObject({ kind: z.literal('settle'), messageId: peerMessageIdSchema, state: z.enum(['cancelled', 'failed']) }),
]).readonly()
/** Monotonic journal with complete operation data for authoritative auditing. */
export const journalSchema = z.strictObject({
  revision: count.min(1), actor: actorSchema,
  operation: z.enum(['register', 'connect', 'add-peer', 'disconnect', 'pause', 'grants', 'budget', 'enqueue', 'reserve-activation', 'admit', 'settle']),
  data: discussionOperationSchema, timestamp,
}).superRefine((entry, ctx) => {
  const kind = entry.data.kind
  const expected = kind === 'enqueue' ? 'session'
    : kind === 'reserve-activation' || kind === 'admit' || kind === 'settle' ? 'system' : 'human'
  if (entry.actor.kind !== expected
    || entry.data.kind === 'enqueue' && entry.actor.kind === 'session' && entry.actor.sessionId !== entry.data.message.sender
    || entry.data.kind === 'add-peer' && entry.actor.kind === 'human' && entry.actor.sessionId !== entry.data.connection.sessions[0]) {
    ctx.addIssue({ code: 'custom', message: 'journal actor does not own the operation' })
  }
}).readonly()
/** Original result retained under the acting identity and stable request key. */
export const receiptSchema = z.strictObject({
  actor: actorSchema, requestId: requestIdSchema, operation: discussionOperationSchema,
  result: z.strictObject({
    revision: count.min(1), connectionId: connectionIdSchema.optional(), messageId: peerMessageIdSchema.optional(),
  }).readonly(),
}).readonly()
/** Explicit limits; capacity stops writes rather than evicting authority or pending work. */
export const stateLimitsSchema = z.strictObject({
  maxStateBytes: count.min(1), maxJournalEntries: count.min(1), maxRequests: count.min(1),
}).readonly()
/** Authoritative aggregate parser, including cross-record ownership and ordered journal facts. */
export const collaborationStateSchema = z.strictObject({
  revision: count, registrations: z.array(registrationSchema).readonly(), connections: z.array(connectionSchema).readonly(),
  outbox: z.array(outboxSchema).readonly(), journal: z.array(journalSchema).readonly(), requests: z.array(receiptSchema).readonly(),
}).superRefine((state, ctx) => {
  const fail = (message: string) => { ctx.addIssue({ code: 'custom', message }) }
  const registered = new Set(state.registrations.map(row => row.sessionId))
  if (registered.size !== state.registrations.length) fail('duplicate registration')
  const pairs = new Set<string>()
  const connections = new Map(state.connections.map(row => [row.id, row]))
  if (connections.size !== state.connections.length) fail('duplicate connection id')
  for (const row of state.connections) {
    if (row.sessions.some(id => !registered.has(id))) fail('unregistered connection member')
    const pair = JSON.stringify([...row.sessions].sort())
    if (pairs.has(pair)) fail('duplicate session pair')
    pairs.add(pair)
    if (row.budget.used !== state.outbox.filter(message => message.connectionId === row.id && message.activationReserved === true).length) {
      fail('activation budget differs from retained reservations')
    }
  }
  if (new Set(state.outbox.map(row => row.id)).size !== state.outbox.length) fail('duplicate message id')
  for (const row of state.outbox) {
    const connection = connections.get(row.connectionId)
    if (row.state === 'queued' && connection === undefined) fail('queued message has no connection')
    if (row.state === 'admitted' && row.activationReserved !== true) fail('admitted message lacks an activation reservation')
    if (connection !== undefined && (!connection.sessions.includes(row.sender) || !connection.sessions.includes(row.recipient))) fail('message endpoints differ from pair')
    if (!registered.has(row.sender) || !registered.has(row.recipient)) fail('unregistered message endpoint')
  }
  if (state.journal.length !== state.revision) fail('journal does not cover committed revisions')
  for (const [index, entry] of state.journal.entries()) {
    if (entry.revision !== index + 1 || entry.operation !== entry.data.kind) fail('unordered or inconsistent journal')
  }
  const keys = new Set<string>()
  for (const receipt of state.requests) {
    const key = JSON.stringify([receipt.actor, receipt.requestId])
    if (keys.has(key)) fail('duplicate actor request key')
    keys.add(key)
    const entry = state.journal[receipt.result.revision - 1]
    if (entry === undefined || JSON.stringify(entry.actor) !== JSON.stringify(receipt.actor) || JSON.stringify(entry.data) !== JSON.stringify(receipt.operation)) fail('request receipt does not match journal')
    const operation = receipt.operation
    const connectionId = 'connectionId' in operation ? operation.connectionId
      : 'connection' in operation ? operation.connection.id : undefined
    const messageId = 'messageId' in operation ? operation.messageId : 'message' in operation ? operation.message.id : undefined
    if (receipt.result.connectionId !== connectionId || receipt.result.messageId !== messageId) fail('request result identifiers differ from operation')
  }
}).readonly()
/** Single authoritative version-1 record; invalid data rejects the whole domain open. */
export const collaborationDomain = defineDomain({
  name: 'collaboration', version: 1,
  tables: { state: domainTable<'current', z.infer<typeof collaborationStateSchema>>(collaborationStateSchema) },
})
