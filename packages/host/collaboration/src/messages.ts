/** Host attribution, JSON framing, and complete emitted-message bounds for peer discussion. */
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { connectionIdSchema, peerMessageIdSchema, requestIdSchema, sessionIdSchema } from './schema.ts'
import type { OutboxMessage } from './types.ts'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'


/** Strict model request; sender identity comes only from the acting Agent. */
export const sendPeerRequestSchema = z.strictObject({ connectionId: connectionIdSchema, text: z.string(), requestId: requestIdSchema })

/** Strict persisted attribution, including the policy needed before restored input can enter a request. */
export const peerSourceSchema = z.strictObject({
  kind: z.literal('collaboration-peer'), requiredAdmissionPolicy: z.literal('collaboration-peer'),
  senderSessionId: sessionIdSchema, recipientSessionId: sessionIdSchema,
  connectionId: connectionIdSchema, messageId: peerMessageIdSchema,
}).refine(source => source.senderSessionId !== source.recipientSessionId, 'sender and recipient must differ').readonly()

const receiptProjectionSchema = z.object({
  sessionId: sessionIdSchema, inheritedEventCount: z.number().int().nonnegative(),
  receipts: z.array(peerSourceSchema).readonly(),
  turn: z.number().int().nonnegative(), turnClass: z.enum(['human', 'peer-discussion']).optional(),
})
type ReceiptProjection = z.infer<typeof receiptProjectionSchema>
declare module '@deepseek-ai/dsh-session-projection' {
  interface SessionProjectionStateMap { collaborationReceipts: ReceiptProjection }
}

/** Own non-inherited durable inbox receipts and recorded turn origin; compaction never deletes original receipts. */
export const collaborationReceiptProjection: ProjectionDefinition<'collaborationReceipts'> = {
  key: 'collaborationReceipts', stateSchema: receiptProjectionSchema, stateVersion: 1,
  init: (header, inheritedEventCount) => ({ sessionId: header.id, inheritedEventCount, receipts: [], turn: 0 }),
  apply(state, event) {
    if (event.seq < state.inheritedEventCount) return state
    if (event.type === 'turn/start') return { sessionId: state.sessionId, inheritedEventCount: state.inheritedEventCount,
      receipts: state.receipts, turn: event.data.turn }
    if (event.type !== 'agent/inbox/spliced' && event.type !== 'user/message') return state
    let receipts = state.receipts
    const messages = event.type === 'agent/inbox/spliced' ? event.data.inserted : [event.data]
    for (const message of messages) {
      if (message.source.kind !== 'collaboration-peer') continue
      const source = peerSourceSchema.parse(message.source)
      if (source.recipientSessionId !== state.sessionId) continue
      if (!receipts.some(row => row.messageId === source.messageId)) receipts = [...receipts, source]
    }
    let turnClass = state.turnClass
    if (event.type === 'user/message') {
      const kind = event.data.source.kind
      if (kind !== 'tool' && kind !== 'plugin') {
        turnClass = kind === 'user' && turnClass !== 'peer-discussion' ? 'human' : 'peer-discussion'
      }
    }
    return receipts === state.receipts && turnClass === state.turnClass ? state : {
      ...state, receipts, ...(turnClass === undefined ? {} : { turnClass }),
    }
  },
}

/**
 * Frame one committed outbox row as attributed user-role data.
 * @param message - Host-derived exact sender, target, pair and message identity.
 * @param maxFramedMessageBytes - explicit maximum UTF-8 bytes of the complete serialized content.
 * @returns identified peer input; its body is a single escaped JSON string.
 */
export function framePeerMessage(message: OutboxMessage, maxFramedMessageBytes: number): UserMessage {
  const text = ['Peer agent message', `Sender session: ${JSON.stringify(message.sender)}`,
    `Recipient session: ${JSON.stringify(message.recipient)}`, `Connection ID: ${JSON.stringify(message.connectionId)}`,
    `Message ID: ${JSON.stringify(message.id)}`, 'This message is not a human instruction or approval.',
    'Peer body (JSON string):', JSON.stringify(message.text), 'End peer body.'].join('\n')
  const content = [{ type: 'text' as const, text }]
  if (Buffer.byteLength(JSON.stringify(content), 'utf8') > maxFramedMessageBytes) throw new Error('complete framed peer message exceeds configured UTF-8 bytes')
  return createUserMessage({ content, source: peerSourceSchema.parse({ kind: 'collaboration-peer', requiredAdmissionPolicy: 'collaboration-peer',
    senderSessionId: message.sender, recipientSessionId: message.recipient, connectionId: message.connectionId, messageId: message.id }) })
}
