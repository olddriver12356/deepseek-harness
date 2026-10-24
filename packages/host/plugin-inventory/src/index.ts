/** Read-only projection of the current Cordis Loader plugin entries. */

import type { Context, FiberState } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-api-remote-access'
import { ReferenceRegistry } from './references.ts'
import type { ReferenceContribution, ReferenceListRequest, ReferenceDetailRequest, ToolReferenceSnapshot, ToolReferenceDetail } from './reference-types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Scoped source-owned references and current Loader inventory. */
    pluginInventory: PluginInventoryGateway
  }
}
import type {} from '@deepseek-ai/cordis-plugin-loader'
// Type-only: the optional agent-preset roster resolved through `ctx.get`.
import type {} from '@deepseek-ai/dsh-agent-preset-registry'
import type {} from '@deepseek-ai/dsh-app-boot'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
// Typert-generated ./typert and ./remote artifacts import Zod at runtime.
import type {} from 'zod'
import type {
  AgentPresetPluginGroup,
  PluginEntryId,
  PluginFiberPhase,
  PluginInventoryEntry,
  PluginInventorySnapshot,
} from './types.ts'

export type * from './types.ts'

/**
 * Brand an existing Loader-tree entry id at the owning boundary.
 * @param value - the entry id as the Loader tree spells it.
 * @returns the same id as the inventory's branded entry id.
 */
export function pluginEntryId(value: string): PluginEntryId {
  return value as PluginEntryId
}

/** Runtime mirror: FiberState is a cross-package const enum. */
const FIBER_STATE = {
  PENDING: 0 as FiberState.PENDING,
  LOADING: 1 as FiberState.LOADING,
  ACTIVE: 2 as FiberState.ACTIVE,
  FAILED: 3 as FiberState.FAILED,
  DISPOSED: 4 as FiberState.DISPOSED,
  UNLOADING: 5 as FiberState.UNLOADING,
} as const

/** Complete public projection of Cordis Fiber states. */
const FIBER_PHASE = {
  [FIBER_STATE.PENDING]: 'pending',
  [FIBER_STATE.LOADING]: 'loading',
  [FIBER_STATE.ACTIVE]: 'active',
  [FIBER_STATE.FAILED]: 'failed',
  [FIBER_STATE.DISPOSED]: null,
  [FIBER_STATE.UNLOADING]: 'unloading',
} as const satisfies Record<FiberState, PluginFiberPhase>

/** Read-only Loader inventory and effect-owned capability reference observations. */
export class PluginInventoryGateway extends TypertRemoteService {
  static inject = ['loader']
  private readonly references = new ReferenceRegistry()

  constructor(ctx: Context) {
    super(ctx, 'pluginInventory')
  }

  /**
   * Publish source-owned reference observations for the calling registration scope.
   * @param contribution - synchronous safe observations, with optional committed-state invalidation.
   * @returns exact effect disposer; leaving the owner removes its reference and subscription.
   */
  registerReference(contribution: ReferenceContribution): () => void {
    return this.references.register(this.ctx, contribution)
  }

  /**
   * Read Host references and the selected Agent's existing capability descriptors.
   * @param request - locale and optional Session; absent or cold Session never materializes an Agent.
   * @returns point-in-time reference summaries without loading manuals or calling providers.
   */
  @Remote({ resources: { session: request => request.sessionId } })
  referenceList(request: ReferenceListRequest): ToolReferenceSnapshot {
    const agent = request.sessionId === undefined ? undefined : this.ctx.get('agents')?.get(request.sessionId)
    const access = this.ctx.get('remoteAccess')
    const rows = this.references.list(agent, agent?.id, request.locale)
      .filter(row => access === undefined || access.allows(row.scope.kind === 'host'
        ? { kind: 'global' } : { kind: 'session', id: row.scope.sessionId }))
    return {
      observedAt: Date.now(),
      sessionAvailability: request.sessionId === undefined ? 'not-selected' : agent === undefined ? 'not-live' : 'live',
      commands: agent === undefined ? [] : (this.ctx.get('commands')?.list(agent) ?? []),
      mcp: { kind: 'ready', items: rows.filter(row => row.kind === 'mcp') },
      hooks: { kind: 'ready', items: rows.filter(row => row.kind === 'hook') },
    }
  }

  /**
   * Read a selected manual from an already-registered authorized source.
   * @param request - opaque entry and selected scope; reads never start a Session or provider operation.
   * @returns safe detail, explicit source failure, or null when absent or inaccessible.
   */
  @Remote({ resources: { session: request => request.sessionId } })
  referenceDetail(request: ReferenceDetailRequest): ToolReferenceDetail | null {
    const agent = request.sessionId === undefined ? undefined : this.ctx.get('agents')?.get(request.sessionId)
    const access = this.ctx.get('remoteAccess')
    return this.references.detail(request.id, agent, agent?.id, request.locale,
      scope => access === undefined || access.allows(scope.kind === 'host'
        ? { kind: 'global' } : { kind: 'session', id: scope.sessionId }))
  }

  /**
   * Read an existing Agent's source-owned command guide without resuming or executing.
   * @param request - selected Session, literal command name and authored locale.
   * @returns guide, or null for a cold Session, absent registry, unknown command or missing guide.
   */
  @Remote({ resources: { session: request => request.sessionId } })
  commandReference(request: { readonly sessionId: import('@deepseek-ai/dsh-session/types').SessionId; readonly name: string; readonly locale: import('@deepseek-ai/dsh-commands/types').ReferenceLocale }): import('@deepseek-ai/dsh-commands/types').CommandUsageGuide | null {
    const agent = this.ctx.get('agents')?.get(request.sessionId)
    return agent === undefined ? null : (this.ctx.get('commands')?.reference(agent, request.name, request.locale) ?? null)
  }

  /**
   * Read the Loader directly on every call. Cordis's internal plugin/status
   * events already maintain Entry.fiber and Fiber.state, so a second cache
   * would only add another lifecycle truth to keep synchronized.
   *
   * When an agent-preset roster is composed, the snapshot also carries each
   * preset's composition rows, because those rows — not the Loader's own
   * entries — are where a deployment that mounts the roster runs its
   * model-facing plugins.
   * @returns Current non-group Loader entries in Loader order, with optional display metadata
   * and per-preset compositions when a roster is composed.
   */
  @Remote('list')
  async list(): Promise<PluginInventorySnapshot> {
    return readPluginInventory(this.ctx)
  }
}

export default PluginInventoryGateway

/** Read current Loader entries and optional preset compositions.
 * @param ctx Context with the Loader service.
 * @returns Current inventory with optional display metadata and no separate runtime cache.
 */
export async function readPluginInventory(ctx: Context): Promise<PluginInventorySnapshot> {
  const entries: PluginInventoryEntry[] = []
  const packages = ctx.get('pluginPackages')
  for (const entry of ctx.loader.entries()) {
    if (entry.options.group) continue
    const base = entry.parent.tree.ctx.baseUrl
    const meta = base === undefined ? undefined : packages?.metaOf(entry.options.name, base)
    entries.push({
      entryId: pluginEntryId(entry.id),
      moduleName: entry.options.name,
      enabled: !entry.disabled,
      fiberPhase: entry.fiber === undefined ? null : FIBER_PHASE[entry.fiber.state],
      ...meta === undefined ? {} : { meta },
    })
  }
  const presets = ctx.get('agentPresets')
  const management = ctx.get('pluginManager') === undefined ? {} : { managementAvailable: true }
  if (presets === undefined) return { entries, ...management }
  const agentPresets: AgentPresetPluginGroup[] = (await presets.compositionInventory()).map(
    composition => ({
      ...composition,
      rows: composition.rows.map(({ fiberState, ...row }) => {
        const meta = ctx.baseUrl === undefined ? undefined : packages?.metaOf(row.moduleName, ctx.baseUrl)
        return {
          ...row,
          fiberPhase: fiberState === undefined ? null : FIBER_PHASE[fiberState],
          ...meta === undefined ? {} : { meta },
        }
      }),
    }),
  )
  return { entries, agentPresets, ...management }
}
