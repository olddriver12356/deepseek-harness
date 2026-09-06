/** Monitor application panel over native DSH surfaces. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/src/client/index.ts'
// Type-only: merges ui-model-selection's `ctx.modelDirectories` Context row.
// The service is the sanctioned cross-plugin channel; nothing is imported as
// a value, so no cross-plugin runtime edge is created.
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import { MonitorPanel, type MonitorEffortAccess } from './MonitorPanel.tsx'

export const inject = ['slots', 'appPanels']

/**
 * Bind the panel's effort selector to the session's shared ModelDirectory —
 * the same instance the composer's model seat and the /model popup use, so a
 * switch made in any of the three is what the other two show next.
 *
 * @param ctx - client root context.
 * @param sessionId - the session whose directory is bound.
 * @returns the panel-facing handle, or undefined when model selection is
 * unavailable for this session (an addressed subagent, an unresolved scope,
 * or ui-model-selection not being loaded at all).
 */
function effortAccessFor(ctx: ClientContext, sessionId: SessionId): MonitorEffortAccess | undefined {
  const directories = ctx.get('modelDirectories')
  if (directories === undefined) return undefined
  let directory
  try {
    directory = directories.directoryFor(sessionId)
  } catch {
    // Unknown or scope-less session: the panel shows its honest empty state
    // rather than taking the whole overlay registration down with it.
    return undefined
  }
  const bound = directory
  return {
    subscribe: listener => bound.store.subscribe(listener),
    getState: () => bound.store.getSnapshot(),
    load: () => { bound.load().catch(() => { /* surfaced on the shared store */ }) },
    select: (effortId) => {
      const { current } = bound.store.getSnapshot()
      if (current === null) return
      bound.select({
        provider: current.provider,
        model: current.model,
        ...effortId === undefined ? {} : { reasoningEffort: effortId },
      }).catch(() => { /* surfaced on the shared store */ })
    },
  }
}

export function apply(ctx: ClientContext): void {
  // Identity must stay stable per session: the handle feeds
  // useSyncExternalStore and a mount effect, both of which would thrash if a
  // fresh object arrived on every render occurrence.
  const accessCache = new Map<SessionId, MonitorEffortAccess | undefined>()
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'monitor-panel',
      inject: (sessionId: SessionId | undefined) => {
        if (sessionId === undefined) return { appPanels: ctx.appPanels, effort: undefined }
        if (!accessCache.has(sessionId)) accessCache.set(sessionId, effortAccessFor(ctx, sessionId))
        return { appPanels: ctx.appPanels, effort: accessCache.get(sessionId) }
      },
    },
    MonitorPanel,
  ))
}
