/** Host attribution, JSON framing, and complete emitted-message bounds for peer discussion. */
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import { sessionIdSchema } from './schema.ts'
import type { OutboxMessage } from './types.ts'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'


import { peerSourceSchema } from './message-schema.ts'
import { classifyMessages } from './authority.ts'
export { peerSourceSchema, sendPeerRequestSchema } from './message-schema.ts'

const receiptProjectionSchema = z.object({
  sessionId: sessionIdSchema, inheritedEventCount: z.number().int().nonnegative(),
  receipts: z.array(peerSourceSchema.unwrap().safeExtend({
    inputId: z.string(), phase: z.enum(['pending', 'claimed', 'started', 'consumed', 'refused', 'cancelled']),
    turn: z.number().int().nonnegative().optional(),
  })).readonly(),
  pendingTurns: z.array(z.string()).readonly(), pendingSteps: z.array(z.string()).readonly(),
  turnOpen: z.boolean(),
  turn: z.number().int().nonnegative(), turnClass: z.enum(['human', 'peer-discussion']).optional(),
})
type ReceiptProjection = z.infer<typeof receiptProjectionSchema>
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { collaborationReceipts: ReceiptProjection }
}

/** Own non-inherited durable inbox receipts and recorded turn origin; compaction never deletes original receipts. */
export const collaborationReceiptProjection: ProjectionDefinition<'collaborationReceipts'> = {
  key: 'collaborationReceipts', stateSchema: receiptProjectionSchema, stateVersion: 4,
  init: (header, inheritedEventCount) => ({ sessionId: header.id, inheritedEventCount, receipts: [], turn: 0,
    turnOpen: false, pendingTurns: [], pendingSteps: [] }),
  apply(state, event) {
    const own = event.seq >= state.inheritedEventCount
    if (!own && event.type !== 'agent/inbox/spliced') return state
    if (event.type === 'turn/start') {
      const { turnClass: _previous, ...retained } = state
      return { ...retained, turn: event.data.turn, turnOpen: true }
    }
    if (event.type === 'turn/end') return { ...state, turnOpen: false, receipts: state.receipts.map(receipt =>
      receipt.turn !== event.data.turn ? receipt : receipt.phase === 'claimed' ? { ...receipt, phase: 'refused' as const }
        : receipt.phase === 'started' ? { ...receipt, phase: 'consumed' as const } : receipt) }
    if (event.type !== 'agent/inbox/spliced' && event.type !== 'user/message') return state
    let receipts = state.receipts
    let pendingTurns = state.pendingTurns
    let pendingSteps = state.pendingSteps
    if (event.type === 'agent/inbox/spliced') {
      const splice = event.data
      const pending = splice.target === 'next-turn' ? pendingTurns : pendingSteps
      const inserted: string[] = splice.inserted.map(message => message.id)
      const removed = new Set(pending.slice(splice.start, splice.start + (splice.removedCount ?? 0)).filter(id => !inserted.includes(id)))
      const next = pending.toSpliced(splice.start, splice.removedCount ?? 0, ...inserted)
      if (splice.target === 'next-turn') pendingTurns = next
      else pendingSteps = next
      receipts = receipts.map(receipt => !removed.has(receipt.inputId) ? receipt : {
        ...receipt, phase: splice.outcome === 'canceled' ? 'cancelled' as const : 'claimed' as const, turn: state.turn,
      })
      receipts = receipts.map(receipt => receipt.phase === 'claimed' && inserted.includes(receipt.inputId)
        ? { ...receipt, phase: 'pending' as const, turn: undefined } : receipt)
    } else {
      // User-message commit follows the final request-policy check; it admits the original claimed batch even after source rewriting.
      receipts = receipts.map(receipt => receipt.phase === 'claimed' && receipt.turn === state.turn
        ? { ...receipt, phase: 'started' as const } : receipt)
    }
    const messages = event.type === 'agent/inbox/spliced' ? event.data.inserted : [event.data]
    for (const message of messages) {
      if (!own || message.source.kind !== 'collaboration-peer') continue
      const source = peerSourceSchema.parse(message.source)
      if (source.recipientSessionId !== state.sessionId) continue
      if (!receipts.some(row => row.messageId === source.messageId)) receipts = [...receipts, {
        ...source, inputId: message.id, phase: event.type === 'user/message' ? 'started' as const : 'pending' as const,
        ...(event.type === 'user/message' ? { turn: state.turn } : {}),
      }]
    }
    let turnClass = state.turnClass
    if (event.type === 'user/message') {
      const claimed = classifyMessages([event.data])
      if (claimed !== undefined) {
        turnClass = claimed === 'human' && turnClass !== 'peer-discussion'
          && !receipts.some(receipt => receipt.phase === 'started' && receipt.turn === state.turn) ? 'human' : 'peer-discussion'
      }
    }
    return {
      ...state, receipts, pendingTurns, pendingSteps, ...(turnClass === undefined ? {} : { turnClass }),
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
