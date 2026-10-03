/** Replayable attributed Peer input from durable required-policy source metadata. */
import type { ContentBlock, MessageSource } from '@deepseek-ai/dsh-llm'
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session/surface'

/** Renderer data contains recorded content and original durable sender attribution. */
export interface PeerMessageData {
  readonly source: Extract<MessageSource, { kind: 'collaboration-peer' }>
  readonly content: readonly ContentBlock[]
  readonly seq: number
}

declare module '@deepseek-ai/dsh-client-ui-chat/client' {
  interface ChatNodeDataMap { /** Original attributed discussion input. */ 'collaboration-peer': PeerMessageData }
}

/** @returns the business-owned Peer Definition using exact recorded attribution. */
export function createPeerDefinition(): ConversationNodeDefinition<PeerMessageData | null> {
  return {
    kind: 'collaboration-peer', target: 'chat',
    match: event => event.type === 'user/message' && isAppendSurfaceEvent(event) ? { id: String(event.data.id), role: 'start' } : null,
    start: (_context, match) => {
      if (match.event.type !== 'user/message') throw new Error('collaboration-peer requires user/message')
      const source = match.event.data.source
      return source.kind === 'collaboration-peer' ? { source, content: match.event.data.content, seq: match.event.seq } : null
    },
    update: context => context.state,
    buildViewNode: context => context.state == null ? null : {
      key: context.key, id: context.id, kind: 'collaboration-peer', target: 'chat', anchorSeq: context.state.seq,
      location: context.start?.location ?? { kind: 'unresolved' }, visibility: 'visible', data: context.state,
    },
  }
}
