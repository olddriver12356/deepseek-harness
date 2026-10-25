import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SkillDeleteRequest, SkillFileRequest, SkillFileWriteRequest, SkillArtifactId, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { SkillsPanel, type CatalogInventory, type CatalogItem } from './SkillsPanel.tsx'
import { ReferenceCatalog } from './ReferenceCatalog.tsx'
import { referenceResourceProvider } from './reference-resources.ts'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import { panelEn, panelZh, type PanelKey } from './panel-locales.ts'
import { createDraftHandoff, draftingPrompt, toolDraftingPrompt, type AgentToolDraft, type AgentToolKind, type SkillDraft } from './creation.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { skillsPanel: PanelKey } }
export const inject = ['uiWorkspace', 'sessions', 'slots', 'locale', 'remote', 'remote.skillFiles', 'remote.commands', 'remote.pluginInventory', 'resources', 'appPanels', 'workspaces']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('skillsPanel', { zh: panelZh, en: panelEn }), 'ui-skill: panel dictionaries')
  const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value
  }
  ctx.effect(() => ctx.resources.register(referenceResourceProvider(ctx.remote.pluginInventory, (listener) => {
    const references = ctx.remote.$on('plugin-inventory/references-changed', listener)
    const commands = ctx.remote.$on('commands/change', listener)
    const presets = ctx.remote.$on('agent-preset/selected', listener)
    const activity = ctx.remote.$on('api-session/status', listener)
    const plugins = ctx.remote.$on('plugin-manager/changed', () => { listener() })
    const reset = ctx.on('connection/reset', () => { listener() })
    return () => { references(); commands(); presets(); activity(); plugins(); reset() }
  })), 'ui-skill: read-only reference resources')
  ctx.slots.inject('tools.reference', () => ctx.slots.register({
    name: 'tools.reference', locale: 'skillsPanel',
    inject: () => ({ hooks: { referenceLocale: ctx.locale } }),
  }, ReferenceCatalog))
  const api = {
    catalog: async (sessionId?: string, presetId?: string): Promise<CatalogInventory> => {
      const plugins = unwrap(await ctx.remote.pluginInventory.list())
      const preset = sessionId === undefined ? undefined : (
        plugins.agentPresets?.find(item => item.id === presetId) ?? plugins.agentPresets?.find(item => item.isDefault)
      )
      const t = ctx.locale.bind('skillsPanel')
      const status = (enabled: boolean | 'conditional', phase: string | null): string => !enabled ? t('catalogDisabled') : enabled === 'conditional' ? t('catalogConditional') : phase === 'active' ? t('catalogActive') : phase === 'failed' ? t('catalogFailed') : phase === 'loading' || phase === 'pending' ? t('loading') : t('catalogConfigured')
      const teamGuide = { category: t('catalogTeamFeature'), when: t('teamWhen'), example: t('teamExample'), note: t('teamNote') }
      const rows: CatalogItem[] = [
        ...plugins.entries.map(item => ({ id: `host:${item.entryId}`, name: item.entryId, description: item.moduleName, source: t('catalogHost'), status: status(item.enabled, item.fiberPhase), detail: item.moduleName })),
        ...(preset?.rows ?? []).map((item, index) => ({ id: `agent:${preset?.id}:${item.entryId ?? index}`, name: item.entryId ?? item.moduleName, description: item.moduleName, source: `${t('catalogPreset')}: ${preset?.name ?? preset?.id}`, status: status(item.enabled, item.fiberPhase), detail: item.moduleName })),
      ].map(item => /@deepseek-ai\/dsh-experimental-(?:tool-)?agent-team(?:-profile)?$/.test(item.detail)
        ? { ...item, guide: teamGuide } : item)
      return {
        commands: [], mcp: [], hooks: [],
        plugins: rows,
      }
    },
    list: async (workspaceId: WorkspaceId) => unwrap(await ctx.remote.skillFiles.list(workspaceId)),
    tree: async (workspaceId: WorkspaceId, id: SkillArtifactId) => unwrap(await ctx.remote.skillFiles.tree(workspaceId, id)),
    read: async (request: SkillFileRequest) => unwrap(await ctx.remote.skillFiles.read(request)),
    write: async (request: SkillFileWriteRequest) => unwrap(await ctx.remote.skillFiles.write(request)),
    remove: async (request: SkillDeleteRequest) => unwrap(await ctx.remote.skillFiles.deleteSkill(request)),
    handoff: (workspaceId: WorkspaceId, draft: SkillDraft, destination: string) =>
      createDraftHandoff(ctx.sessions, workspaceId, draftingPrompt(draft, destination), (id) => { ctx.uiWorkspace.openSession(id) }),
    handoffTool: (workspaceId: WorkspaceId, kind: AgentToolKind, draft: AgentToolDraft) =>
      createDraftHandoff(ctx.sessions, workspaceId, toolDraftingPrompt(kind, draft), (id) => { ctx.uiWorkspace.openSession(id) }),
  }
  ctx.slots.inject('shell.app-overlay', () => ctx.slots.register({
    name: 'shell.app-overlay', id: 'skills-panel', locale: 'skillsPanel',
    children: { 'tools.reference': { kind: 'single', scope: 'root' } },
    inject: () => ({ appPanels: ctx.appPanels, workspaces: ctx.workspaces, sessions: ctx.sessions, api, t: ctx.locale.bind('skillsPanel') }),
  }, SkillsPanel))
}
