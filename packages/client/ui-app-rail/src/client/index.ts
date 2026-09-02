/**
 * App rail plugin, browser half: one register() call contributes AppRail into
 * the shell's 'app.rail' slot. It declares no children and seats no store,
 * because the active panel lives in ctx.appPanels where every panel can read
 * it. The inject hook supplies that service as the registrant's business
 * share, so the component itself imports no cordis.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { AppRail } from './AppRail.tsx'

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'appPanels']

/**
 * Client plugin body: contribute the rail into the shell's rail slot.
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
}
