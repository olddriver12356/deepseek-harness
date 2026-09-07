import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { StyleDraft, StyleRecord } from '@deepseek-ai/dsh-host-styles/types'
import { StylesPanel } from './StylesPanel.tsx'
import { en, zh, type StyleLocaleKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Styles application copy. */
    styles: StyleLocaleKey
  }
}

export { StylesPanel } from './StylesPanel.tsx'
export type { StyleApi, StylesPanelProps, StyleTranslate } from './StylesPanel.tsx'
export type { StyleLocaleKey } from './locales.ts'
export type { StyleDraft, StyleRecord, StyleStatus } from './types.ts'

export const inject = ['slots', 'appPanels', 'sessions', 'remote', 'remote.styles', 'locale']

const NS = 'styles'

function remoteValue<T>(result:
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-styles: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'styles-panel',
      locale: NS,
      inject: () => ({
        appPanels: ctx.appPanels,
        t,
        api: {
          list: async () => remoteValue(await ctx.remote.styles.list()),
          create: async (style: StyleDraft) => remoteValue(await ctx.remote.styles.create({ style })),
          update: async (id: string, style: StyleDraft) => remoteValue(await ctx.remote.styles.update({ id, style })),
          remove: async (id: string) => { remoteValue(await ctx.remote.styles.delete({ id })) },
          dispatch: async (style: StyleRecord, task: string) => {
            const current = ctx.sessions.list.getSnapshot().current
            if (current === undefined) throw new Error(t('noSession'))
            const session = ctx.sessions.binding(current)?.session
            if (session === undefined) throw new Error(t('sessionNotReady'))
            const text = [
              `Use the following approved Style for this task's output voice.\n\n## Style\n${style.name}\n\n## Instructions\n${style.instructions}`,
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
    StylesPanel,
  ))
}
