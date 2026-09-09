import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ExpertDraft, ExpertRecord } from '@deepseek-ai/dsh-host-experts/types'
import type { StyleRecord } from '@deepseek-ai/dsh-host-styles/types'
import { ExpertsPanel } from './ExpertsPanel.tsx'
import { ExpertSelect } from './ExpertSelect.tsx'
import type { ExpertSelectInjected } from './ExpertSelect.tsx'
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

export const inject = ['slots', 'appPanels', 'sessions', 'remote', 'remote.experts', 'remote.styles', 'locale', 'conversation']

const NS = 'experts'

/** Shared once per prompt, never per Expert — this is an operating duty, not domain content. */
const AGENT_SKILLS_NOTICE = [
  '## Agent Skills',
  'The vault Agent Layer keeps a folder of skills you may create and use for yourself: `Agents/5 Methods/Skills/<name>/`, shaped like a normal skill package (SKILL.md plus optional SCRIPTS/REFERENCES/EXAMPLES/REFLECT). These are draft, agent-authored skills, not the reviewed human skill inventory, and they are not auto-loaded, so read one explicitly when it applies to the task at hand.',
  'When you find a reusable procedure worth keeping, add or update a package there. After using one, self-improve it only by appending one line to its REFLECT/ file describing how it went; never rewrite the SKILL.md body yourself.',
].join('\n')

const PERMISSION_NOTICE: Record<string, string> = {
  'read-only': 'Treat this session as read-only for this task: inspect and analyze only, make no edits, run no mutating commands.',
  'workspace-write': 'You may edit files and run commands scoped to this workspace for this task.',
  'danger-full-access': 'Full access is granted for this task; still confirm before any irreversible action.',
}

function permissionNotice(permission: string): string {
  const notice = PERMISSION_NOTICE[permission]
  return notice === undefined ? '' : `## Permission\n${notice}`
}

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
          listStyles: async () => remoteValue(await ctx.remote.styles.list()),
          dispatch: async (expert: ExpertRecord, task: string, style: StyleRecord | undefined) => {
            const current = ctx.sessions.list.getSnapshot().current
            if (current === undefined) throw new Error(t('noSession'))
            const session = ctx.sessions.binding(current)?.session
            if (session === undefined) throw new Error(t('sessionNotReady'))
            const text = [
              `Use the following approved Expert Method for this task.\n\n## Expert\n${expert.name}\n\n## Instructions\n${expert.instructions}`,
              permissionNotice(expert.permission),
              style === undefined ? '' : `## Output style\n${style.name}\n\n${style.instructions}`,
              AGENT_SKILLS_NOTICE,
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

  const composeExpertsText = (experts: readonly ExpertRecord[]): string => experts.length === 0
    ? ''
    : [
      ...experts.map(expert => [
        `## Expert\n${expert.name}\n\n## Instructions\n${expert.instructions}`,
        permissionNotice(expert.permission),
      ].filter(Boolean).join('\n\n')),
      AGENT_SKILLS_NOTICE,
    ].join('\n\n')

  ctx.slots.inject('shell.activity.selectors', () => ctx.slots.register(
    {
      name: 'shell.activity.selectors',
      id: 'experts',
      locale: NS,
      inject: (sessionId: SessionId): ExpertSelectInjected => ({
        listExperts: async () => remoteValue(await ctx.remote.experts.list()),
        setSelection: (experts: readonly ExpertRecord[]) => {
          ctx.conversation.prefixes.set(
            sessionId,
            'experts',
            experts.length === 0 ? undefined : { text: composeExpertsText(experts) },
          )
        },
      }),
    },
    ExpertSelect,
  ))
}
