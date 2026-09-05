/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-monitor`.
 * @module @deepseek-ai/dsh-client-ui-monitor/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-monitor'

/** Cordis companion plugin name. */
export const name = 'client-ui-monitor-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the UI-only Monitor panel owns no cross-plugin mutable
 * relationship yet.
 */
const install: InvariantInstaller = () => {}

/** Register this package's invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
