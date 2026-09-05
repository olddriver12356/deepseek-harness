import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { ExpertsPanel } from './ExpertsPanel.tsx'

export { ExpertsPanel } from './ExpertsPanel.tsx'
export type { ExpertRecord } from './types.ts'

export const inject = ['slots', 'appPanels']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'experts-panel',
      inject: () => ({ appPanels: ctx.appPanels }),
    },
    ExpertsPanel,
  ))
}
