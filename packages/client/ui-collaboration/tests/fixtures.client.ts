import { vi } from 'vitest'
import type { CollaborationControlSnapshot, ConnectionId, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { BoardProps } from '../src/client/types.ts'
import { en } from '../src/client/locales.ts'

export const sid = 'a' as SessionId
export const peer = 'b' as SessionId
export const snapshot = {
  revision: 4,
  observations: [],
  registrations: [{ sessionId: sid, title: 'Author', cwd: '/repo/main' }, { sessionId: peer, title: 'Reviewer', cwd: '/repo/review' }],
  connections: [{ id: 'pair' as ConnectionId, sessions: [sid, peer], disclosureAccepted: true, grants: { snapshot: true, follow: true }, budget: { limit: 3, used: 1 }, paused: false }],
  outbox: [{ id: 'message' as CollaborationControlSnapshot['outbox'][number]['id'], connectionId: 'pair' as ConnectionId, sender: peer, recipient: sid, text: 'Check the parser', state: 'admitted' }],
} satisfies CollaborationControlSnapshot

export function props(open = false) {
  const state = { open, selected: 'pair' as ConnectionId, readThrough: {} as Record<string, CollaborationControlSnapshot['outbox'][number]['id'] | undefined>, draft: { peerId: '', title: '', peerTitle: '', activationLimit: '', snapshot: false, follow: false, disclosure: false }, budget: '' }
  const useCollaboration: BoardProps['useCollaboration'] = select => select({ view: snapshot, phase: 'ready', error: null })
  const useStore: BoardProps['useStore'] = select => select(state)
  const useSessions: BoardProps['useSessions'] = select => select({ ids: [sid, peer], phase: 'ready', projectionsBySession: {}, byId: {
    [sid]: { id: sid, displayTitle: 'Author', cwd: '/repo/main', running: true, retainedBy: {}, blank: false, updatedAt: 1 },
    [peer]: { id: peer, displayTitle: 'Reviewer', cwd: '/repo/review', running: false, retainedBy: {}, blank: false, updatedAt: 1 },
  } })
  return {
    sessionId: sid, useCollaboration, useStore, useSessions,
    actions: { open: vi.fn(), close: vi.fn(), select: vi.fn(), draft: vi.fn(), budget: vi.fn(), read: vi.fn() },
    state,
    addPeer: vi.fn(async () => {}), control: vi.fn(async () => {}), setBudget: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}), openSession: vi.fn(),
    t: makeTranslate(en),
  }
}
