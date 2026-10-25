/** Resource-backed read-only manuals and local observation invalidation. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ResourceProvider } from '@deepseek-ai/dsh-client-resources/client'
import type { CommandUsageGuide, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'
import type { PluginInventorySnapshot, ToolReferenceDetail, ToolReferenceId, ToolReferenceSnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap { 'reference/read-failed': Record<string, never> }
}

/** Address identity; presets partition cache only and never establish a live registration. */
export interface ReferenceTarget {
  readonly kind: 'catalog' | 'command' | 'detail'
  readonly locale: ReferenceLocale
  readonly generation: number
  readonly sessionId?: SessionId
  readonly presetId?: string
  readonly selected?: string
}
/** One lazily loaded reference resource. */
export type ReferenceResource =
  | { readonly kind: 'catalog'; readonly snapshot: ToolReferenceSnapshot; readonly plugins: PluginInventorySnapshot }
  | { readonly kind: 'command'; readonly guide: CommandUsageGuide | null }
  | { readonly kind: 'detail'; readonly detail: ToolReferenceDetail | null }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { 'tool-reference': ReferenceResource }
}

/**
 * Encode one scoped reference observation as a resource identity.
 * @param target - scope and selected observation.
 * @returns encoded stable resource identity.
 */
export function referenceAddress(target: ReferenceTarget): string {
  const query = new URLSearchParams({ locale: target.locale, generation: String(target.generation) })
  if (target.sessionId !== undefined) query.set('session', target.sessionId)
  if (target.presetId !== undefined) query.set('preset', target.presetId)
  if (target.selected !== undefined) query.set('selected', target.selected)
  return `dsh-resource://tool-reference/${target.kind}?${query}`
}
/**
 * Parse the resource protocol's scope and selection.
 * @param address - untrusted resource URL.
 * @returns validated selection, or undefined for another/invalid address.
 */
export function parseReferenceAddress(address: string): ReferenceTarget | undefined {
  let url: URL
  try { url = new URL(address) } catch (_error) { return undefined }
  const kind = url.pathname.slice(1)
  const locale = url.searchParams.get('locale')
  const generation = Number(url.searchParams.get('generation'))
  if (url.protocol !== 'dsh-resource:' || url.hostname !== 'tool-reference'
    || (kind !== 'catalog' && kind !== 'command' && kind !== 'detail') || (locale !== 'en' && locale !== 'zh')
    || !Number.isSafeInteger(generation) || generation < 0) return undefined
  const sessionId = url.searchParams.get('session')
  const presetId = url.searchParams.get('preset')
  const selected = url.searchParams.get('selected')
  if (kind !== 'catalog' && !selected) return undefined
  return { kind, locale, generation,
    ...sessionId === null ? {} : { sessionId: sessionId as SessionId },
    ...presetId === null ? {} : { presetId }, ...selected === null ? {} : { selected },
  }
}

/**
 * Resolve open reference resources using the generated read-only Remote face.
 * @param inventory - existing inventory Remote, never command execution or Session activation.
 * @param subscribe - per-resource event subscription returning exact release.
 * @returns abortable provider with no polling and no background reads after release.
 */
export function referenceResourceProvider(
  inventory: Pick<Context['remote']['pluginInventory'], 'referenceList' | 'referenceDetail' | 'commandReference' | 'list'>,
  subscribe: (listener: (sessionId?: SessionId) => void) => () => void,
): ResourceProvider<'tool-reference'> {
  return {
    protocol: 'tool-reference',
    async *open(address, { signal }): AsyncIterable<RemoteResult<ReferenceResource>> {
      const target = parseReferenceAddress(address)
      if (target === undefined || signal.aborted || (target.kind !== 'catalog' && target.selected === undefined)) return
      const selected = target.selected ?? ''
      let dirty = true
      const aborted = (): boolean => signal.aborted
      const changed = (): boolean => dirty
      let wake: (() => void) | undefined
      const unsubscribe = subscribe((sessionId) => {
        if (sessionId !== undefined && sessionId !== target.sessionId) return
        dirty = true
        wake?.()
      })
      let subscribed = true
      const release = (): void => {
        if (!subscribed) return
        subscribed = false
        unsubscribe()
      }
      const abort = (): void => { release(); wake?.() }
      signal.addEventListener('abort', abort, { once: true })
      try {
        while (!aborted()) {
          if (!dirty) await new Promise<void>((resolve) => { wake = resolve })
          if (aborted()) return
          dirty = false
          let frame: RemoteResult<ReferenceResource>
          try {
            if (target.kind === 'catalog') {
              const [snapshot, plugins] = await Promise.all([
                inventory.referenceList({ locale: target.locale,
                  ...target.sessionId === undefined ? {} : { sessionId: target.sessionId } }),
                inventory.list(),
              ])
              frame = !snapshot.ok ? snapshot : !plugins.ok ? plugins
                : { ok: true, value: { kind: 'catalog', snapshot: snapshot.value, plugins: plugins.value } }
            } else if (target.kind === 'command') {
              if (target.sessionId === undefined) frame = { ok: true, value: { kind: 'command', guide: null } }
              else {
                const result = await inventory.commandReference({ sessionId: target.sessionId, name: selected, locale: target.locale })
                frame = result.ok ? { ok: true, value: { kind: 'command', guide: result.value } } : result
              }
            } else {
              const result = await inventory.referenceDetail({ id: target.selected as ToolReferenceId, locale: target.locale,
                ...target.sessionId === undefined ? {} : { sessionId: target.sessionId } })
              frame = result.ok ? { ok: true, value: { kind: 'detail', detail: result.value } } : result
            }
          } catch (_error) {
            frame = { ok: false, error: new RemoteError('reference/read-failed', 'Reference read failed.', {}) }
          }
          if (aborted()) return
          if (changed()) continue
          yield frame
        }
      } finally {
        signal.removeEventListener('abort', abort)
        release()
      }
    },
  }
}
