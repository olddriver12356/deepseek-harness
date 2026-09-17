/** Browser News panel over the mounted Host News Remote. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { NewsPanel, type NewsCapture } from './NewsPanel.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, zh, type NewsActionKey } from './locales.ts'

export type { NewsCapture, NewsPanelProps, NewsReader } from './NewsPanel.tsx'
export { NewsPanel } from './NewsPanel.tsx'

export const inject = ['slots', 'appPanels', 'remote', 'remote.news', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { newsActions: NewsActionKey }
}

/** Register the persistent News overlay in the shell's additive slot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('newsActions', { zh, en }), 'news: action copy')
  ctx.slots.inject('shell.app-overlay', () => ctx.slots.register(
    {
      name: 'shell.app-overlay',
      id: 'news-panel',
      locale: 'newsActions',
      inject: () => {
        const knowledge = ctx.get('remote.knowledge') as typeof ctx.remote.knowledge | undefined
        return {
          appPanels: ctx.appPanels,
          t: ctx.locale.bind('newsActions'),
          // Explicit button gesture only; saveText alone remains model-free.
          distillNews: knowledge === undefined ? undefined : async (request: Parameters<NewsCapture>[0]) => {
            const saved = await knowledge.saveText(request)
            if (!saved.ok) throw new Error(`${saved.error.code}: ${saved.error.message}`)
            const processed = await knowledge.distill({ id: saved.value.id })
            if (!processed.ok) throw new Error(`${processed.error.code}: ${processed.error.message}`)
          },
          read: async ({ refresh }: { readonly refresh: boolean }) => {
            const result = await ctx.remote.news.list({ refresh })
            if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
            return result.value
          },
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
