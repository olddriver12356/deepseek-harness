/** Read-only, source-owned Tool reference data; excludes executable configuration. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { CommandDescriptor, ReferenceLocale } from '@deepseek-ai/dsh-commands/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'

export type { ReferenceLocale } from '@deepseek-ai/dsh-commands/types'

/** Opaque identity of one live reference registration, invalidated on disposal. */
export type ToolReferenceId = Branded<'ToolReferenceId'>
/** Lifecycle position, independent of adapter and execution outcome. */
export type HookType = 'session' | 'prompt' | 'tool' | 'turn-completion' | 'subagent'
/** Visibility of a registered source; preset configuration is not a live Session. */
export type ReferenceScope = { readonly kind: 'host' } | { readonly kind: 'session'; readonly sessionId: SessionId }
/** Whether source-owned documentation was supplied. */
export type ReferenceDocumentation = 'supplied' | 'partial' | 'missing'
/** Observation of the connection supervisor, not the Loader fiber. */
export type McpConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'

/** Common source-owned summary without registry identity or configuration. */
export interface ReferenceSummaryContent {
  readonly name: string
  readonly description: string
  readonly documentation: ReferenceDocumentation
}
/** Server summary supplied by its connection owner. */
export interface McpSummaryContent extends ReferenceSummaryContent {
  readonly state: McpConnectionState
}
/** Handler summary supplied after successful registration. */
export interface HookSummaryContent extends ReferenceSummaryContent {
  readonly types: readonly HookType[]
  readonly events: readonly string[]
  readonly enabled: boolean
}
/** Tool documentation captured at committed MCP discovery, never fetched by this read. */
export interface McpToolReference {
  readonly publicName: string
  readonly rawName: string
  readonly description: string
  readonly inputSchema: JsonValue
  readonly outputSchema?: JsonValue
  /** Provider claims, never a security guarantee. */
  readonly annotations?: {
    readonly title?: string
    readonly readOnlyHint?: boolean
    readonly destructiveHint?: boolean
    readonly idempotentHint?: boolean
    readonly openWorldHint?: boolean
  }
}
/** Connection-owned documentation snapshot. Endpoints and transport arguments are excluded. */
export interface McpDetailContent {
  readonly transport: 'stdio' | 'streamable-http'
  readonly instructions: string
  readonly toolsAvailability: 'current' | 'unavailable'
  readonly tools: readonly McpToolReference[]
}
/** Registered handler documentation; raw hook commands and outputs are excluded. */
export interface HookDetailContent {
  readonly adapter: 'claude-code' | 'codex'
  readonly matcher?: string
  readonly trigger: string
  readonly effects: readonly string[]
  readonly limitations: readonly string[]
  readonly lastExecution: { readonly kind: 'unavailable'; readonly reason: 'uncorrelated-history' | 'not-recorded' }
}
/** Registry-owned identity and source fields. */
export interface ReferenceIdentity {
  readonly id: ToolReferenceId
  readonly kind: 'mcp' | 'hook'
  readonly moduleName: string
  readonly scope: ReferenceScope
}
/** A single source failed to supply a snapshot; neighboring sources remain readable. */
export interface ReferenceUnavailable extends ReferenceIdentity {
  readonly name: string
  readonly description: string
  readonly documentation: 'missing'
  readonly state: 'unavailable'
  readonly code: 'REFERENCE_SOURCE_UNAVAILABLE'
}
/** Lightweight list row; manuals and schemas are loaded only on selection. */
export type ToolReferenceSummary =
  | (ReferenceIdentity & McpSummaryContent & { readonly kind: 'mcp' })
  | (ReferenceIdentity & HookSummaryContent & { readonly kind: 'hook' })
  | ReferenceUnavailable
/** Selected source detail, or an explicit per-source failure. */
export type ToolReferenceDetail =
  | (ReferenceIdentity & McpSummaryContent & McpDetailContent & { readonly kind: 'mcp' })
  | (ReferenceIdentity & HookSummaryContent & HookDetailContent & { readonly kind: 'hook' })
  | ReferenceUnavailable
/** Optional change subscription owned by the registration effect. */
export interface ReferenceChangeSource {
  /**
   * Observe committed owner snapshots without triggering provider IO.
   * @param listener - non-vetoing invalidation observer.
   * @returns synchronous unsubscribe, called when the contribution leaves.
   */
  readonly subscribeChanged?: (listener: () => void) => () => void
}
/** Disposable source-owned synchronous readers, never configuration or execution callbacks. */
export type ReferenceContribution = ReferenceChangeSource & { readonly moduleName: string } & (
  | { readonly kind: 'mcp'; readonly summary: (locale: ReferenceLocale) => McpSummaryContent; readonly detail: (locale: ReferenceLocale) => McpDetailContent }
  | { readonly kind: 'hook'; readonly summary: (locale: ReferenceLocale) => HookSummaryContent; readonly detail: (locale: ReferenceLocale) => HookDetailContent }
)
/** Read Host sources and, when selected, an already-live Session's sources. */
export interface ReferenceListRequest {
  readonly sessionId?: SessionId
  readonly locale: ReferenceLocale
}
/** Select an opaque registration within the authorized scope. */
export interface ReferenceDetailRequest extends ReferenceListRequest {
  readonly id: ToolReferenceId
}
/** Commands are empty without a live Agent; unavailable is not an empty successful observation. */
export interface ToolReferenceSnapshot {
  readonly observedAt: number
  readonly sessionAvailability: 'live' | 'not-live' | 'not-selected'
  readonly commands: readonly CommandDescriptor[]
  readonly mcp: { readonly kind: 'ready'; readonly items: readonly ToolReferenceSummary[] }
  readonly hooks: { readonly kind: 'ready'; readonly items: readonly ToolReferenceSummary[] }
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One or more reference observations changed; no provider IO has been requested.
     * @param sessionId - affected Session when known; absent for Host or shared-scope changes.
     * @mode emit
     */
    'plugin-inventory/references-changed'(sessionId?: SessionId): void
  }
}
