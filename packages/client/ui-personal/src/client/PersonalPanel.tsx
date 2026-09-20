import { useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import css from './PersonalPanel.module.css'
import { QuickNote } from './QuickNote.tsx'

export const inject = ['slots', 'appPanels', 'locale']
const zh = { title: '关于我', caption: '个人记忆中心', quickNote: '＋ 随手记', close: '关闭随手记' }
type Key = keyof typeof zh
const en: Record<Key, string> = { title: 'About me', caption: 'Personal memory', quickNote: '+ Quick note', close: 'Close quick note' }
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { personal: Key } }

/** Keep the original page mounted between panel switches, including unsaved corrections. */
export function PersonalPanel({ appPanels, t }: { appPanels: IAppPanels; t: (key: Key) => string }) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [visited, setVisited] = useState(false)
  if (active === 'personal' && !visited) setVisited(true)
  return <section className={css.panel} data-personal-panel hidden={active !== 'personal'} aria-label={t('title')}>
    {visited && <iframe className={css.frame} src="/personal/" title={t('caption')} />}
  </section>
}

/** Register the Personal Core page through the shell's normal overlay slot. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register('personal', { zh, en }), 'personal: dictionaries')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'quick-note', locale: 'personal',
  }, QuickNote))
  ctx.slots.inject('shell.app-overlay', () => ctx.slots.register({
    name: 'shell.app-overlay', id: 'personal-panel', locale: 'personal',
    inject: () => ({ appPanels: ctx.appPanels, t: ctx.locale.bind('personal') }),
  }, PersonalPanel))
}
