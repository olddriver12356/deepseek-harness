/** Pure data and actions supplied by the discussion plugin's apply closure. */
import type { AddPeerRequest, CollaborationControlSnapshot, ConnectionId, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createCollaborationStore } from './stores.ts'

/** Last complete committed view and its transport state. */
export interface CollaborationData {
  readonly view: CollaborationControlSnapshot | null
  readonly phase: 'loading' | 'ready' | 'failed'
  readonly error: string | null
}

/** Private observable plus the only authorized discussion callbacks. */
export interface CollaborationInjected {
  readonly hooks: { readonly collaboration: HostObservable<CollaborationData> }
  readonly addPeer: (request: Omit<AddPeerRequest, 'sessionId' | 'expectedRevision' | 'requestId'>) => Promise<void>
  readonly control: (action: 'pause' | 'resume' | 'removePeer', connectionId: ConnectionId) => Promise<void>
  readonly setBudget: (connectionId: ConnectionId, limit: number) => Promise<void>
  readonly refresh: () => Promise<void>
  readonly openSession: (sessionId: SessionId) => void
}

/** Session-scoped portal props derived from renderer seats. */
export type PortalProps = PropsRuntime<'shell.activity.selectors'> & InjectFace<CollaborationInjected>
  & PropsStore<ReturnType<typeof createCollaborationStore>> & PropsLocale<'collaboration'>

/** Session-scoped discussion dialog props derived from renderer seats. */
export type BoardProps = PropsRuntime<'collaboration.board'> & InjectFace<CollaborationInjected>
  & PropsStore<ReturnType<typeof createCollaborationStore>> & PropsLocale<'collaboration'>
