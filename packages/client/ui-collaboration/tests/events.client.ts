import type { SessionEventLikeEntry } from '@deepseek-ai/dsh-api-session-controller/client'

export const original = { kind: 'collaboration-peer', requiredAdmissionPolicy: 'collaboration-peer', senderSessionId: 'b', recipientSessionId: 'a', connectionId: 'pair', messageId: 'peer-original' } as const

function entry(seq: number, data: unknown): SessionEventLikeEntry {
  return { type: 'event', event: { seq, time: seq, type: 'user/message', surfaceOp: 'append', data } } as SessionEventLikeEntry
}

/** A truncated opening page deliberately omits the original Inbox, reorder and claim events. */
export const truncatedWindow = [
  entry(104, { id: 'input-human', role: 'user', content: [{ type: 'text', text: 'Human body' }], source: { kind: 'user' } }),
  entry(105, { id: 'input-peer', role: 'user', content: [{ type: 'text', text: '<script>Peer body</script>' }], source: original }),
]
