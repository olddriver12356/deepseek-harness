import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { AppsPanel, type AppsApi } from './AppsPanel.tsx'
import { en, zh, type AppsKey } from './locales.ts'
export const inject = ['slots', 'appPanels', 'remote', 'remote.apps', 'remote.directoryPicker', 'locale']
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { apps: AppsKey } }
const value = <T>(result: { ok: true; value: T } | { ok: false; error: { message: string } }): T => {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}
/** Mount the registered local application collection into the native shell. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('apps', { zh, en }), 'apps: localized copy')
  const api: AppsApi = {
    list: async () => value(await ctx.remote.apps.list()),
    inspect: async directory => value(await ctx.remote.apps.inspect({ directory })),
    save: async registration => value(await ctx.remote.apps.save({ registration })),
    remove: async id => value(await ctx.remote.apps.unregister({ id })),
    start: async (id, script) => value(await ctx.remote.apps.start({ id, ...(script ? { script } : {}) })),
    stop: async id => value(await ctx.remote.apps.stop({ id })),
    logs: async id => value(await ctx.remote.apps.logs({ id })),
    confirmExternal: async id => value(await ctx.remote.apps.confirmExternal({ id })),
    pick: async () => value(await ctx.remote.directoryPicker.pick()),
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'apps-panel', locale: 'apps', inject: () => ({ appPanels: ctx.appPanels, api, t: ctx.locale.bind('apps') }) }, AppsPanel))
}
