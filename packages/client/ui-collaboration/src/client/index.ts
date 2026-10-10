import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
/** Optional connection portal, discussion dialog and attributed Peer node registrations. */
import type { Context } from '@deepseek-ai/cordis'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { CollaborationRequestId, ConnectionId, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { CollaborationDataSource, valueOf } from './data.ts'
import { createCollaborationStore } from './stores.ts'
import { BoardOutlet } from './BoardOutlet.tsx'
import { Portal } from './Portal.tsx'
import { Board } from './Board.tsx'
import { PeerMessage } from './PeerMessage.tsx'
import { createPeerDefinition } from './peer-definition.ts'
import { en, zh, type CollaborationKey } from './locales.ts'
import type { CollaborationData, CollaborationInjected } from './types.ts'

export { createCollaborationStore } from './stores.ts'
export type { PortalProps, BoardProps, CollaborationInjected } from './types.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Render the selected Session's discussion dialog with no owner payload.
     * The renderer supplies a definite Session binding; a registration replaces
     * the single dialog seat. Without a registration no dialog is rendered.
     */
    'collaboration.board': { kind: 'single'; scope: 'session' }
  }
  interface LocaleNamespaceMap { /** Discussion-only UI copy. */ collaboration: CollaborationKey }
}

/** The feature uses generated Remote actions and existing UI extension points only. */
export const inject = ['uiWorkspace', 'slots', 'sessions', 'remote', 'remote.collaboration', 'uiConversation', 'chatInputs', 'locale']

/** @param ctx - Client plugin scope providing transport, sessions and renderer registries. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('collaboration', { en, zh }), 'ui-collaboration: dictionaries')
  const store = createCollaborationStore()
  const sources = new Map<SessionId, CollaborationDataSource>()
  const empty: CollaborationData = { view: null, phase: 'loading', error: null }
  const noSession = { getSnapshot: () => empty, subscribe: () => () => {} }
  const sourceFor = (sessionId: SessionId) => {
    let source = sources.get(sessionId)
    if (source === undefined) {
      source = new CollaborationDataSource(ctx.remote, sessionId)
      sources.set(sessionId, source)
      source.start()
    }
    return source
  }
  ctx.effect(() => async () => { await Promise.all([...sources.values()].map(source => source.dispose())); sources.clear() }, 'ui-collaboration: data lifetime')
  const injected = (sessionId: SessionId | undefined): CollaborationInjected => {
    const source = sessionId === undefined ? undefined : sourceFor(sessionId)
    const mutation = () => {
      const revision = source?.getSnapshot().view?.revision
      if (sessionId === undefined || revision === undefined) throw new Error(ctx.locale.bind('collaboration')('loading'))
      return { sessionId, expectedRevision: revision, requestId: randomUUID() as CollaborationRequestId }
    }
    const finish = async (result: Parameters<typeof valueOf>[0]) => {
      valueOf(result)
      await source?.refresh()
    }
    return {
      hooks: { collaboration: source ?? noSession },
      addPeer: async (request) => { await finish(await ctx.remote.collaboration.addPeer({ ...request, ...mutation() })) },
      control: async (action, connectionId: ConnectionId) => {
        await finish(await ctx.remote.collaboration[action]({ ...mutation(), connectionId }))
      },
      setBudget: async (connectionId, limit) => {
        await finish(await ctx.remote.collaboration.budget({ ...mutation(), connectionId, limit }))
      },
      refresh: async () => { await source?.refresh() },
      openSession: (id) => { ctx.uiWorkspace.openSession(id) },
    }
  }
  ctx.slots.inject('shell.activity.selectors', () => ctx.slots.register({
    name: 'shell.activity.selectors', id: 'collaboration', order: 30, locale: 'collaboration', store, inject: injected,
  }, Portal))
  ctx.slots.inject('shell.app-overlay', () => ctx.slots.register({
    name: 'shell.app-overlay', id: 'collaboration', children: { 'collaboration.board': { kind: 'single', scope: 'session' } },
  }, BoardOutlet))
  ctx.slots.inject('collaboration.board', () => ctx.slots.register({
    name: 'collaboration.board', locale: 'collaboration', store, inject: injected,
  }, Board))
  ctx.uiConversation.events.register(createPeerDefinition())
  ctx.chatInputs.excludeSource('collaboration-peer')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'collaboration-peer', locale: 'collaboration',
  }, PeerMessage))
}
