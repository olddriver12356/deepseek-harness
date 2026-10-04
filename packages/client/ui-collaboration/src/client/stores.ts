/** View state shared by the compact portal and its discussion dialog. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { CollaborationControlSnapshot, ConnectionId } from '@deepseek-ai/dsh-api-remotes/client'

type IncomingMessageId = CollaborationControlSnapshot['outbox'][number]['id']

/** Human-authored draft; limits remain blank until explicitly entered. */
export interface ConnectionDraft {
  peerId: string
  title: string
  peerTitle: string
  activationLimit: string
  snapshot: boolean
  follow: boolean
  disclosure: boolean
}

/**
 * Declare selection, drafts, visibility and reading positions without authoritative connection state.
 * @returns per-Session view store handle.
 */
export function createCollaborationStore() {
  return defineStore({
    init: () => ({ open: false, selected: undefined as ConnectionId | undefined,
      readThrough: {} as Record<string, IncomingMessageId | undefined>, budget: '', draft: {
        peerId: '', title: '', peerTitle: '', activationLimit: '', snapshot: false, follow: false, disclosure: false,
      } as ConnectionDraft }),
    actions: {
      open: (state, selected?: ConnectionId) => { state.open = true; state.selected = selected },
      close: (state) => { state.open = false },
      select: (state, selected: ConnectionId) => { state.selected = selected; state.budget = '' },
      draft: (state, patch: Partial<ConnectionDraft>) => { Object.assign(state.draft, patch) },
      budget: (state, value: string) => { state.budget = value },
      read: (state, connectionId: ConnectionId, messageId: IncomingMessageId) => { state.readThrough[connectionId] = messageId },
    },
  })
}
