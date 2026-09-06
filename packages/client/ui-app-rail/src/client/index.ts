/**
 * App rail plugin, browser half: one register() call contributes AppRail into
 * the shell's 'app.rail' slot. It declares no children and seats no store,
 * because the active panel lives in ctx.appPanels where every panel can read
 * it. The inject hook supplies that service as the registrant's business
 * share, so the component itself imports no cordis.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { AppRail } from './AppRail.tsx'
import { ProofPanel } from './ProofPanel.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'appPanels']

/**
 * Client plugin body: contribute the rail into the shell's rail slot, plus a
 * temporary fallback panel for unfinished application panels.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () => ctx.slots.register(
      {
        name: 'app.rail',
        inject: () => ({ appPanels: ctx.appPanels }),
      },
      AppRail,
    ),
    'ui-app-rail: rail registration',
  )
  ctx.effect(
    () => ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'ui-app-rail-proof-panel',
        inject: () => ({ appPanels: ctx.appPanels }),
      },
      ProofPanel,
    ),
    'ui-app-rail: proof panel registration',
  )
}
