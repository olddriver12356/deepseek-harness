import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SkillDeleteRequest, SkillFileRequest, SkillFileWriteRequest, SkillArtifactId, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { SkillsPanel } from './SkillsPanel.tsx'
import { panelEn, panelZh, type PanelKey } from './panel-locales.ts'
import { createDraftHandoff, draftingPrompt, type SkillDraft } from './creation.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { skillsPanel: PanelKey } }
export const inject = ['sessions', 'slots', 'locale', 'remote', 'remote.skillFiles', 'appPanels', 'workspaces']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('skillsPanel', { zh: panelZh, en: panelEn }), 'ui-skill: panel dictionaries')
  const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
  }
  const api = {
    list: async (workspaceId: WorkspaceId) => unwrap(await ctx.remote.skillFiles.list(workspaceId)),
    tree: async (workspaceId: WorkspaceId, id: SkillArtifactId) => unwrap(await ctx.remote.skillFiles.tree(workspaceId, id)),
    read: async (request: SkillFileRequest) => unwrap(await ctx.remote.skillFiles.read(request)),
    write: async (request: SkillFileWriteRequest) => unwrap(await ctx.remote.skillFiles.write(request)),
    remove: async (request: SkillDeleteRequest) => unwrap(await ctx.remote.skillFiles.deleteSkill(request)),
    handoff: (workspaceId: WorkspaceId, draft: SkillDraft, destination: string) =>
      createDraftHandoff(ctx.sessions, workspaceId, draftingPrompt(draft, destination)),
  }
  ctx.slots.inject('shell.app-overlay', () => ctx.slots.register({
    name: 'shell.app-overlay', id: 'skills-panel', locale: 'skillsPanel',
    inject: () => ({ appPanels: ctx.appPanels, workspaces: ctx.workspaces, sessions: ctx.sessions, api, t: ctx.locale.bind('skillsPanel') }),
  }, SkillsPanel))
}
