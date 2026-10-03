import { useState, useSyncExternalStore } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import css from './PersonalPanel.module.css'
import { QuickNote } from './QuickNote.tsx'
import { MemoryPanel } from './MemoryPanel.tsx'
import { personalZh as zh, personalEn as en } from './memory-locales.ts'

export const inject = ['slots', 'appPanels', 'locale']
type Key = keyof typeof zh
declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { personal: Key } }

/** Keep the original page mounted between panel switches, including unsaved corrections. */
export function PersonalPanel({ appPanels, t }: { appPanels: IAppPanels; t: (key: Key) => string }) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [visited, setVisited] = useState(false)
  const [memory, setMemory] = useState(false)
  if (active === 'personal' && !visited) setVisited(true)
  return <section className={css.panel} data-personal-panel hidden={active !== 'personal'} aria-label={t('title')}>
    <nav className={css.localNav} aria-label={t('title')}>
      <button type="button" aria-label={memory ? t('memoryBack') : t('title')} aria-current={!memory ? 'page' : undefined} onClick={() =>{  setMemory(false) }}>{t('title')}</button>
      <span aria-hidden="true">›</span><button type="button" aria-current={memory ? 'page' : undefined} onClick={() =>{  setMemory(true) }}>{t('memory')}</button>
    </nav>
    <div className={css.content} hidden={memory}>{visited && <iframe className={css.frame} src="/personal/" title={t('caption')} />}</div>
    {memory && <div className={css.content}><MemoryPanel t={t} /></div>}
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
