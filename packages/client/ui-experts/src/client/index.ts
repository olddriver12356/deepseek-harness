import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ExpertDraft, ExpertRecord } from '@deepseek-ai/dsh-host-experts/types'
import { ExpertsPanel } from './ExpertsPanel.tsx'
import { en, zh, type ExpertLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Experts application copy. */
    experts: ExpertLocaleKey
  }
}

export { ExpertsPanel } from './ExpertsPanel.tsx'
export type { ExpertApi, ExpertsPanelProps, ExpertTranslate } from './ExpertsPanel.tsx'
export type { ExpertLocaleKey } from './locales.ts'
export type { ExpertDraft, ExpertRecord, ExpertStatus } from './types.ts'

export const inject = ['slots', 'appPanels', 'sessions', 'remote', 'remote.experts', 'locale']

const NS = 'experts'

function remoteValue<T>(result:
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-experts: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'experts-panel',
      locale: NS,
      inject: () => ({
        appPanels: ctx.appPanels,
        t,
        api: {
          list: async () => remoteValue(await ctx.remote.experts.list()),
          create: async (expert: ExpertDraft) => remoteValue(await ctx.remote.experts.create({ expert })),
          update: async (id: string, expert: ExpertDraft) => remoteValue(await ctx.remote.experts.update({ id, expert })),
          remove: async (id: string) => { remoteValue(await ctx.remote.experts.delete({ id })) },
          dispatch: async (expert: ExpertRecord, task: string, style: string) => {
            const current = ctx.sessions.list.getSnapshot().current
            if (current === undefined) throw new Error(t('noSession'))
            const session = ctx.sessions.binding(current)?.session
            if (session === undefined) throw new Error(t('sessionNotReady'))
            const text = [
              `Use the following approved Expert Method for this task.\n\n## Expert\n${expert.name}\n\n## Instructions\n${expert.instructions}`,
              style === '' ? '' : `## Output style\n${style}`,
              `## Task\n${task}`,
            ].filter(Boolean).join('\n\n')
            const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] })
            try {
              remoteValue(await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId))
            } catch (error) {
              submission.abandon()
              throw error
            }
          },
        },
      }),
    },
    ExpertsPanel,
  ))
}
