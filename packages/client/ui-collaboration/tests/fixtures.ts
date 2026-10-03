import { vi } from 'vitest'
import type { CollaborationControlSnapshot, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en } from '../src/client/locales.ts'

export const sid = 'a' as SessionId
export const peer = 'b' as SessionId
export const snapshot = {
  revision: 4,
  observations: [],
  registrations: [{ sessionId: sid, title: 'Author', cwd: '/repo/main' }, { sessionId: peer, title: 'Reviewer', cwd: '/repo/review' }],
  connections: [{ id: 'pair', sessions: [sid, peer], disclosureAccepted: true, grants: { snapshot: true, follow: true }, budget: { limit: 3, used: 1 }, paused: false }],
  outbox: [{ id: 'message', connectionId: 'pair', sender: peer, recipient: sid, text: 'Check the parser', state: 'admitted' }],
} as CollaborationControlSnapshot

export function props(open = false) {
  const state = { open, selected: 'pair', draft: { peerId: '', title: '', peerTitle: '', activationLimit: '', snapshot: false, follow: false, disclosure: false }, budget: '' }
  return {
    sessionId: sid,
    useCollaboration: (select: (value: unknown) => unknown) => select({ view: snapshot, phase: 'ready', error: null }),
    useStore: (select: (value: unknown) => unknown) => select(state),
    useSessions: (select: (value: unknown) => unknown) => select({ ids: [sid, peer], phase: 'ready', byId: {
      a: { id: sid, displayTitle: 'Author', cwd: '/repo/main', running: true },
      b: { id: peer, displayTitle: 'Reviewer', cwd: '/repo/review', running: false },
    } }),
    actions: { open: vi.fn(), close: vi.fn(), select: vi.fn(), draft: vi.fn(), budget: vi.fn() },
    addPeer: vi.fn(async () => {}), control: vi.fn(async () => {}), setBudget: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}), openSession: vi.fn(),
    t: makeTranslate(en),
  }
}
