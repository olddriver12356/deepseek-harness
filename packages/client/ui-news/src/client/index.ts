/** Browser News panel over the mounted Host News Remote. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { NewsPanel } from './NewsPanel.tsx'

export type { NewsCapture, NewsPanelProps, NewsReader } from './NewsPanel.tsx'
export { NewsPanel } from './NewsPanel.tsx'

export const inject = ['slots', 'appPanels', 'remote', 'remote.news']

/** Register the persistent News overlay in the shell's additive slot. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'news-panel',
      inject: () => {
        // The generated Remote types assert every namespace exists, but at runtime a namespace is
        // absent whenever its host plugin is not composed, so this widening is what lets the News
        // panel keep working in a composition that omits the Knowledge host. Resolved per render
        // rather than at apply time, so a Knowledge Remote mounted later is picked up.
        const knowledge: typeof ctx.remote.knowledge | undefined = ctx.remote.knowledge
        return {
          appPanels: ctx.appPanels,
          read: async ({ refresh }: { readonly refresh: boolean }) => {
            const result = await ctx.remote.news.list({ refresh })
            if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
            return result.value
          },
          /* oxlint-disable-next-line typescript/no-unnecessary-condition --
             the generated Remote types assert every namespace exists, but one is
             genuinely absent at runtime when its host plugin is not composed. */
          saveToKnowledge: knowledge === undefined
            ? undefined
            : async (request: {
              readonly sourceUrl: string
              readonly publisher: string
              readonly retrievedAt: string
              readonly title: string
              readonly content: string
            }) => {
              const result = await knowledge.saveText(request)
              if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
            },
        }
      },
    },
    NewsPanel,
  ))
}
