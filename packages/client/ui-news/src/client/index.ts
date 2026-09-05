/** Browser News panel over the mounted Host News Remote. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { NewsPanel } from './NewsPanel.tsx'

export type { NewsPanelProps, NewsReader } from './NewsPanel.tsx'
export { NewsPanel } from './NewsPanel.tsx'

export const inject = ['slots', 'appPanels', 'remote']

/** Register the persistent News overlay in the shell's additive slot. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'news-panel',
      inject: () => ({
        appPanels: ctx.appPanels,
        read: async ({ refresh }: { readonly refresh: boolean }) => {
          const result = await ctx.remote.news.list({ refresh })
          if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
          return result.value
        },
      }),
    },
    NewsPanel,
  ))
}
