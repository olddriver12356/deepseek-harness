/** Effect-owned source registry and explicit wire projections for Tool references. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { NamedEntries, ScopedLayers, scopeOf, type ScopeKey, type ScopeLayer } from '@deepseek-ai/dsh-scope'
import type { ReferenceContribution, ReferenceLocale, ReferenceScope, ReferenceIdentity, ReferenceUnavailable, ToolReferenceDetail, ToolReferenceId, ToolReferenceSummary } from './reference-types.ts'

interface Entry {
  readonly id: ToolReferenceId
  readonly source: ReferenceContribution
  readonly scope: ScopeKey | undefined
}

class ReferenceLayer implements ScopeLayer {
  readonly entries = new NamedEntries<Entry>(id => new Error(`duplicate reference id: ${id}`))
  isEmpty(): boolean { return this.entries.isEmpty() }
}

/** Registration storage only; all observations remain owned by each source. */
export class ReferenceRegistry {
  private readonly layers = new ScopedLayers(() => new ReferenceLayer(), () => {})

  /**
   * Retain synchronous readers and their change subscription in the caller's effect.
   * @param ctx - exact registration owner and visibility scope.
   * @param source - safe authored/read-only observation callbacks.
   * @returns the exact Cordis disposer.
   */
  register(ctx: Context, source: ReferenceContribution): () => void {
    const id = randomUUID() as ToolReferenceId
    const scope = scopeOf(ctx)
    const notify = (): void => {
      for (const callback of ctx.events.dispatch('emit', ['plugin-inventory/references-changed'])) {
        try {
          const returned: unknown = callback()
          void Promise.resolve(returned).catch((_error: unknown) => { ctx.logger.warn('Tool reference change observer rejected; refresh the reference to read current state.') })
        } catch (_error: unknown) {
          ctx.logger.warn('Tool reference change observer failed; refresh the reference to read current state.')
        }
      }
    }
    return this.layers.effect(ctx, (layer) => {
      const undo = layer.entries.insert(id, { id, source, scope })
      let retained = true
      let unsubscribe: (() => void) | undefined
      try {
        unsubscribe = source.subscribeChanged?.(() => { if (retained) notify() })
      } catch (error: unknown) {
        retained = false
        undo()
        throw error
      }
      notify()
      return () => {
        retained = false
        undo()
        try {
          unsubscribe?.()
        } finally {
          notify()
        }
      }
    }, { label: 'pluginInventory.registerReference()', notify: false })
  }

  /**
   * Project lightweight rows visible along the existing scope chain.
   * @param scope - selected live Agent, or undefined for Host only.
   * @param sessionId - selected Agent identity when live.
   * @param locale - authored content language.
   * @param allows - optional access predicate evaluated before any source reads.
   * @returns independent rows, containing source failures without leaking diagnostics.
   */
  list(scope: ScopeKey | undefined, sessionId: import('@deepseek-ai/dsh-session/types').SessionId | undefined, locale: ReferenceLocale, allows?: (visibility: ReferenceScope) => boolean): ToolReferenceSummary[] {
    return [...this.layers.merge(scope, layer => layer.entries).values()]
      .filter(entry => allows?.(this.visibility(entry, sessionId)) !== false)
      .map(entry => this.summary(entry, this.visibility(entry, sessionId), locale))
  }

  /**
   * Read one visible live contribution without invoking out-of-scope sources.
   * @param id - opaque registration identity.
   * @param scope - selected live Agent, or undefined for Host only.
   * @param sessionId - selected Agent identity when live.
   * @param locale - authored content language.
   * @param allows - access decision made before reading any source callback.
   * @returns selected detail, explicit source failure, or null for an absent registration.
   */
  detail(id: ToolReferenceId, scope: ScopeKey | undefined, sessionId: import('@deepseek-ai/dsh-session/types').SessionId | undefined, locale: ReferenceLocale, allows: (visibility: ReferenceScope) => boolean): ToolReferenceDetail | null {
    const entry = this.layers.merge(scope, layer => layer.entries).get(id)
    if (entry === undefined) return null
    const visibility = this.visibility(entry, sessionId)
    if (!allows(visibility)) return null
    const summary = this.summary(entry, visibility, locale)
    if ('state' in summary && summary.state === 'unavailable') return summary
    try {
      if (entry.source.kind === 'mcp' && summary.kind === 'mcp' && 'state' in summary) {
        const value = entry.source.detail(locale)
        return {
          ...summary,
          transport: value.transport,
          instructions: value.instructions,
          toolsAvailability: value.toolsAvailability,
          tools: value.tools.map(tool => ({
            publicName: tool.publicName, rawName: tool.rawName, description: tool.description,
            inputSchema: tool.inputSchema,
            ...tool.outputSchema === undefined ? {} : { outputSchema: tool.outputSchema },
            ...tool.annotations === undefined ? {} : { annotations: {
              ...tool.annotations.title === undefined ? {} : { title: tool.annotations.title },
              ...tool.annotations.readOnlyHint === undefined ? {} : { readOnlyHint: tool.annotations.readOnlyHint },
              ...tool.annotations.destructiveHint === undefined ? {} : { destructiveHint: tool.annotations.destructiveHint },
              ...tool.annotations.idempotentHint === undefined ? {} : { idempotentHint: tool.annotations.idempotentHint },
              ...tool.annotations.openWorldHint === undefined ? {} : { openWorldHint: tool.annotations.openWorldHint },
            } },
          })),
        }
      }
      if (entry.source.kind === 'hook' && summary.kind === 'hook' && 'events' in summary) {
        const value = entry.source.detail(locale)
        return {
          ...summary, adapter: value.adapter,
          ...value.matcher === undefined ? {} : { matcher: value.matcher },
          trigger: value.trigger, effects: [...value.effects], limitations: [...value.limitations],
          lastExecution: { kind: 'unavailable', reason: value.lastExecution.reason },
        }
      }
      return this.unavailable(entry, visibility)
    } catch (_error: unknown) {
      // Source snapshots can fail independently; no execution is attempted and no partial detail escapes.
      return this.unavailable(entry, visibility)
    }
  }

  private visibility(entry: Entry, sessionId: import('@deepseek-ai/dsh-session/types').SessionId | undefined): ReferenceScope {
    return entry.scope === undefined || sessionId === undefined ? { kind: 'host' } : { kind: 'session', sessionId }
  }

  private identity(entry: Entry, scope: ReferenceScope): ReferenceIdentity {
    return { id: entry.id, kind: entry.source.kind, moduleName: entry.source.moduleName, scope }
  }

  private unavailable(entry: Entry, scope: ReferenceScope): ReferenceUnavailable {
    return { ...this.identity(entry, scope), name: entry.source.moduleName, description: '', documentation: 'missing', state: 'unavailable', code: 'REFERENCE_SOURCE_UNAVAILABLE' }
  }

  private summary(entry: Entry, scope: ReferenceScope, locale: ReferenceLocale): ToolReferenceSummary {
    try {
      const identity = this.identity(entry, scope)
      if (entry.source.kind === 'mcp') {
        const value = entry.source.summary(locale)
        return { ...identity, kind: 'mcp', name: value.name, description: value.description, documentation: value.documentation, state: value.state }
      }
      const value = entry.source.summary(locale)
      return { ...identity, kind: 'hook', name: value.name, description: value.description, documentation: value.documentation, types: [...value.types], events: [...value.events], enabled: value.enabled }
    } catch (_error: unknown) {
      // Only this observation is unavailable; raw source errors can contain private configuration.
      return this.unavailable(entry, scope)
    }
  }
}
