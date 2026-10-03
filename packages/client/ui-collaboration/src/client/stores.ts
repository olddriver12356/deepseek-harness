/** View state shared by the compact portal and its discussion dialog. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { ConnectionId } from '@deepseek-ai/dsh-api-remotes/client'

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
 * Declare selection, drafts and visibility without authoritative connection state.
 * @returns per-Session view store handle.
 */
export function createCollaborationStore() {
  return defineStore({
    init: () => ({ open: false, selected: undefined as ConnectionId | undefined, budget: '', draft: {
      peerId: '', title: '', peerTitle: '', activationLimit: '', snapshot: false, follow: false, disclosure: false,
    } as ConnectionDraft }),
    actions: {
      open: (state, selected?: ConnectionId) => { state.open = true; state.selected = selected },
      close: (state) => { state.open = false },
      select: (state, selected: ConnectionId) => { state.selected = selected; state.budget = '' },
      draft: (state, patch: Partial<ConnectionDraft>) => { Object.assign(state.draft, patch) },
      budget: (state, value: string) => { state.budget = value },
    },
  })
}

/**
 * Bridge two declared renderer scopes onto the same Session's local view state.
 * Each handle belongs to one slot scope; only drafts, selection and visibility are shared.
 * @returns separately scoped handles and their plugin-lifetime cleanup.
 */
export function createCollaborationStores() {
  const factory = createCollaborationStore()
  const instances = new Map<string | undefined, ReturnType<typeof factory.create>>()
  const create = (scopeKey?: string) => {
    let instance = instances.get(scopeKey)
    if (instance === undefined) { instance = factory.create(scopeKey); instances.set(scopeKey, instance) }
    return instance
  }
  return { portal: { ...factory, create }, board: { ...factory, create }, dispose: () => { instances.clear() } }
}
