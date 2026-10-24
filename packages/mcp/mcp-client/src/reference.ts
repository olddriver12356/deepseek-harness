/** Read-only MCP observations published by the connection supervisor. */
import type { Context } from '@deepseek-ai/cordis'
import type { McpConnectionState, McpDetailContent } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type {} from '@deepseek-ai/dsh-host-plugin-inventory'

/** Committed supervisor observation, independent of plugin activation state. */
export interface McpReferenceSnapshot extends McpDetailContent {
  readonly state: McpConnectionState
}

/** A supervisor-owned reader and non-vetoing committed-state subscription. */
export interface McpReferenceSource {
  /** @returns current local observation without discovery or transport IO. */
  reference(): McpReferenceSnapshot
  /** @param listener - invalidation observer. @returns exact unsubscribe. */
  subscribeChanged(listener: () => void): () => void
}

/**
 * Publish an optional inventory contribution for this server's plugin lifetime.
 * @param ctx - server owner with optional inventory service.
 * @param serverName - configured namespace, not an endpoint or command.
 * @param source - supervisor-local observation reader.
 */
export function registerReference(ctx: Context, serverName: string, source: McpReferenceSource): void {
  ctx.inject(['pluginInventory'], (scope) => {
    scope.get('pluginInventory')?.registerReference({
      kind: 'mcp', moduleName: '@deepseek-ai/dsh-mcp-client',
      summary: () => {
        const snapshot = source.reference()
        return { name: serverName, description: '', documentation: snapshot.instructions === '' ? 'partial' : 'supplied', state: snapshot.state }
      },
      detail: () => source.reference(),
      subscribeChanged: listener => source.subscribeChanged(listener),
    })
  })
}
