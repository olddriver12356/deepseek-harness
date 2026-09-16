/**
 * Knowledge plugin, browser half: one persistent overlay reads the active
 * application panel and real upstream Agent Layer artifacts.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { CaptureButton, ConnectedKnowledgePanel } from './ConnectedKnowledgePanel.tsx'
import { en, zh, type KnowledgeLocaleKey } from './locales.ts'

export type {
  KnowledgeArtifact, KnowledgeArtifactState, KnowledgeLayer, KnowledgeLayerId, KnowledgeSnapshot,
} from './types.ts'
export { KNOWLEDGE_FIXTURE } from './fixture.ts'
export { KnowledgePanel } from './KnowledgePanel.tsx'

/** Required services: slot composition and active application-panel state. */
export const inject = ['slots', 'appPanels', 'remote', 'remote.knowledge', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { knowledge: KnowledgeLocaleKey }
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/** Register the persistent Knowledge overlay after the shell declares its slot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('knowledge', { zh, en }), 'ui-knowledge: dictionaries')
  const t = ctx.locale.bind('knowledge')
  const api = {
    raw: async (id: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeId) => value(await ctx.remote.knowledge.raw({ id })),
    learn: async (request: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeLearnRequest) => value(await ctx.remote.knowledge.learn(request)),
    list: async () => value(await ctx.remote.knowledge.list()),
    read: async (id: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeId) => value(await ctx.remote.knowledge.read({ id })),
    distill: async (id: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeId) => value(await ctx.remote.knowledge.distill({ id })),
    review: async (request: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeReviewRequest) => value(await ctx.remote.knowledge.review(request)),
    preview: async (request: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgePreviewRequest) => value(await ctx.remote.knowledge.preview(request)),
    promote: async (request: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgePromoteRequest) => value(await ctx.remote.knowledge.promote(request)),
    shelve: async (request: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeShelveRequest) => value(await ctx.remote.knowledge.shelve(request)),
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'knowledge-panel',
      locale: 'knowledge',
      inject: () => ({ appPanels: ctx.appPanels, api, t }),
    },
    ConnectedKnowledgePanel,
  ))
  ctx.slots.inject('shell.activity.capture', () => ctx.slots.register(
    { name: 'shell.activity.capture', locale: 'knowledge', inject: (sessionId: SessionId) => ({
      t,
      save: async () => { value(await ctx.remote.knowledge.save({ sessionId, title: sessionId })) },
      open: () => { ctx.appPanels.setActive('knowledge') },
    }) },
    CaptureButton,
  ))
}
