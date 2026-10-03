/**
 * Opt-in Host plugin for human-authorized peer discussion between independently owned sessions.
 * This entry installs turn authority only; messaging, state, and tools arrive in later modules.
 * @module @deepseek-ai/dsh-host-collaboration
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { installCollaborationAuthority, peerDiscussionToolNames } from './authority.ts'

export { requireCollaborationAuthority } from './authority.ts'

export type { HumanControlAdmission, HumanControlScope, TurnClass } from './authority.ts'

/** Plugin name for the Cordis loader. */
export const name = 'collaboration'

/** Services the plugin needs before it activates. */
export const inject = ['tools']

/** Validated plugin configuration. */
export interface Config {
  /** Reviewed read and collaboration tools a peer turn may call; other names fail loading. */
  readonly peerDiscussionTools: Array<(typeof peerDiscussionToolNames)[number]>
}

/** Schema for {@link Config}; the default admits only the read-only file tools. */
export const Config: z<Config> = z.object({
  peerDiscussionTools: z.array(z.union([...peerDiscussionToolNames])).default(['read', 'glob', 'grep']),
})

/**
 * Install turn authority for the plugin's lifetime.
 * @param ctx - plugin context.
 * @param config - validated configuration.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => installCollaborationAuthority(ctx, { allowedTools: new Set(config.peerDiscussionTools) }), 'collaboration.authority')
}
