import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { AppRegistration, AppSnapshot, AppLogs, ProjectInspection } from '@deepseek-ai/dsh-host-apps/types'
import type { AppsKey } from './locales.ts'
import css from './AppsPanel.module.css'

export interface AppsApi {
  list(): Promise<{ apps: AppSnapshot[] }>
  inspect(directory: string): Promise<ProjectInspection>
  save(registration: AppRegistration): Promise<unknown>
  remove(id: string): Promise<unknown>
  start(id: string, script?: string): Promise<unknown>
  stop(id: string): Promise<unknown>
  logs(id: string): Promise<AppLogs>
  confirmExternal(id: string): Promise<unknown>
  pick(): Promise<string | null>
}
export interface AppsPanelProps { appPanels: IAppPanels; api: AppsApi; t(key: AppsKey): string }
const defaults: AppRegistration = { id: '', name: '', description: '', directory: '', packageManager: 'npm', script: '', url: 'http://localhost:3000', port: 3000, strategy: 'fixed' }
const preferred = ['dev', 'start', 'serve', 'studio', 'preview']

function initials(name: string): string[] {
  if (name.trim().toLowerCase() === 'headroom') return ['H', 'R']
  const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').match(/[\p{L}\p{N}]+/gu) ?? []
  return Array.from(words.length > 1 ? words.map(word => word[0]).join('') : words[0] ?? '').slice(0, 2).map(letter => letter.toUpperCase())
}

/** Persistent native collection; Host owns registration and process state. */
export function AppsPanel({ appPanels, api, t }: AppsPanelProps) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot) === 'apps'
  const [apps, setApps] = useState<AppSnapshot[]>([])
  const [error, setError] = useState('')
  const [form, setForm] = useState<AppRegistration | null>(null)
  const [inspection, setInspection] = useState<ProjectInspection | null>(null)
  const [busy, setBusy] = useState(false)
  const [allScripts, setAllScripts] = useState(false)
  const [managerConfirmed, setManagerConfirmed] = useState(true)
  const [filter, setFilter] = useState('all')
  const [logs, setLogs] = useState<AppLogs | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const logDialog = useRef<HTMLDialogElement>(null)
  const pendingTabs = useRef(new Map<string, Window>())
  const refresh = async () => {
    const result = await api.list()
    setApps(result.apps)
    for (const app of result.apps) {
      const tab = pendingTabs.current.get(app.id)
      if (tab && ['running', 'failed', 'stopped'].includes(app.state)) {
        if (app.state === 'running' && !tab.closed) tab.location.replace(app.activeUrl)
        else if (!tab.closed) tab.close()
        pendingTabs.current.delete(app.id)
      }
    }
  }
  useEffect(() => {
    let disposed = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try { if (active || pendingTabs.current.size) await refresh() } catch (e) { if (!disposed) setError(String(e)) }
      if (!disposed) timer = setTimeout(poll, 1500)
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [active, api])
  useEffect(() => () => { for (const tab of pendingTabs.current.values()) tab.close(); pendingTabs.current.clear() }, [])
  useEffect(() => { if (form) dialog.current?.showModal(); else dialog.current?.close() }, [form !== null])
  useEffect(() => { if (logs) logDialog.current?.showModal(); else logDialog.current?.close() }, [logs !== null])
  const act = async (fn: () => Promise<unknown>) => {
    setError(''); setBusy(true)
    try { await fn(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const edit = async (app?: AppRegistration) => act(async () => {
    const directory = app?.directory ?? await api.pick()
    if (!directory) return
    const info = await api.inspect(directory)
    setInspection(info); setAllScripts(false)
    setManagerConfirmed(Boolean(app) || info.packageManagers.length === 1)
    setForm(app ?? {
      ...defaults, directory: info.directory, name: info.name, packageManager: info.packageManagers[0] ?? 'npm',
      script: preferred.find(s => s in info.scripts) ?? Object.keys(info.scripts)[0] ?? '',
    })
  })
  const launch = (app: AppSnapshot) => {
    const tab = window.open('about:blank', '_blank')
    if (tab) { tab.opener = null; pendingTabs.current.set(app.id, tab) }
    void act(async () => { try { await api.start(app.id) } catch (e) { tab?.close(); pendingTabs.current.delete(app.id); throw e } })
  }
  const patch = (value: Partial<AppRegistration>) => setForm(current => current && { ...current, ...value })
  return <section className={css.panel} hidden={!active} aria-label={t('title')}>
    <header className={css.header}><strong>{t('title')}</strong></header>
    <div className={css.content}>
      <div className={css.hero}><div><p className={css.kicker}>{t('collection')}</p><h1>{t('headingLead')} <span>{t('headingAccent')}</span></h1><p className={css.intro}>{t('intro')}</p></div><button className={css.register} disabled={busy} onClick={() => void edit()}><span aria-hidden>＋</span>{t('register')}</button></div>
      {error && <p role="alert" className={css.error}>{error}</p>}
      <div className={css.toolbar}><div className={css.filters}>{(['all', 'running', 'stopped'] as const).map(key => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(key === 'running' ? 'runningFilter' : key)} {apps.filter(app => key === 'all' || (key === 'running' ? ['running', 'external'].includes(app.state) : app.state === 'stopped')).length}</button>)}</div><span className={css.summary}>{t('collectionSummary')}</span></div>
      <div className={css.grid}>
        {!apps.length && <p className={css.empty}>{t('empty')}</p>}
        {apps.map((app, index) => <article key={app.id} className={css.card} data-color={index % 3} hidden={filter !== 'all' && (filter === 'running' ? !['running', 'external'].includes(app.state) : app.state !== 'stopped')}>
          <span className={css.face} aria-hidden />
          <div className={css.cardTop}><span className={css.icon} aria-hidden>
            <svg viewBox="0 0 56 56" fill="none"><path d="M9 12L42 9L47 43L13 48Z" fill="var(--scrap-back)" /><path d="M14 9L47 14L42 48L9 42Z" fill="var(--scrap-front)" /><path d="M11 13H43L42 18L44 23L42 28L44 33L42 38L43 44H11Z" fill="#ede3cf" /><path d="M6 18V6H18M38 50H50V38" stroke="var(--tape)" strokeWidth="1.5" strokeLinecap="round" /><path d="M17 41H38" stroke="var(--scrap-front)" strokeWidth="1.5" strokeDasharray="1 2" /><path d="M20 9L35 8L36 14L21 15Z" fill="var(--tape)" fillOpacity=".85" /></svg>
            <span className={css.letters}>{initials(app.name).map((letter, i) => <span key={i}>{letter}</span>)}</span>
          </span><span className={css.state} data-state={app.state}><span className={css.dot} />{t(app.state)}</span></div>
          <h2>{app.name}</h2><p className={css.description}>{app.description}</p>
          <dl className={css.meta}><dt>{t('scriptLabel')}</dt><dd>{app.packageManager}{app.packageManager === 'npm' ? ' run ' : ' '}{app.script}</dd><dt>{t(['running', 'external'].includes(app.state) ? 'urlLabel' : 'portLabel')}</dt><dd>{['running', 'external'].includes(app.state) ? app.activeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') : `${app.port}${app.strategy === 'fixed' ? '' : ' → AUTO'}`}</dd></dl>
          {app.error && <p role="alert" className={css.cardError}>{app.error}</p>}
          <div className={css.actions}>
            {['running', 'external'].includes(app.state) ? <a href={app.activeUrl} target="_blank" rel="noopener noreferrer">{t('open')} ↗</a> : <button disabled={busy || app.state === 'starting'} onClick={() => launch(app)}>{t(app.state === 'starting' ? 'starting' : 'start')}</button>}
            {['running', 'starting'].includes(app.state) && <button disabled={busy} onClick={() => void act(() => api.stop(app.id))}>{t('stop')}</button>}
            <details><summary aria-label={t('more')}>···</summary><div className={css.menu}>
              <button onClick={() => void act(async () => setLogs(await api.logs(app.id)))}>{t('logs')}</button>
              <button disabled={busy || ['running', 'starting'].includes(app.state)} onClick={() => void edit(app)}>{t('edit')}</button>
              <button disabled={busy || ['running', 'starting'].includes(app.state)} onClick={() => { if (window.confirm(t('removePrompt'))) void act(() => api.remove(app.id)) }}>{t('remove')}</button>
              {!['running', 'starting'].includes(app.state) && <button onClick={() => { if (window.confirm(`${t('confirmExternal')}\n${app.url}`)) void act(() => api.confirmExternal(app.id)) }}>{t('confirmExternal')}</button>}
            </div></details>
          </div>
        </article>)}
        <button className={css.add} onClick={() => void edit()} disabled={busy}><span className={css.plus} aria-hidden>＋</span><b>{t('addAnother')}</b><small>{t('registrationHint')}</small></button>
      </div>
    </div>
    <dialog ref={dialog} className={css.dialog} onCancel={() => setForm(null)}>
      {form && <form onSubmit={(e) => { e.preventDefault(); void act(async () => { await api.save(form); setForm(null) }) }}>
        <h2>{t('register')}</h2>{error && <p role="alert">{error}</p>}
        <label>{t('directory')}<input value={form.directory} readOnly /></label>
        <label>{t('name')}<input required value={form.name} onChange={e => patch({ name: e.target.value })} /></label>
        <label>{t('description')}<input value={form.description} onChange={e => patch({ description: e.target.value })} /></label>
        <label>{t('script')}<select value={form.script} onChange={e => patch({ script: e.target.value })}>{Object.keys(inspection?.scripts ?? {}).filter(s => allScripts || preferred.includes(s) || s === form.script).map(s => <option key={s}>{s}</option>)}</select></label>
        <label><input type="checkbox" checked={allScripts} onChange={e => setAllScripts(e.target.checked)} />{t('allScripts')}</label>
        <label>{t('manager')}<select required value={managerConfirmed ? form.packageManager : ''} onChange={(e) => { patch({ packageManager: e.target.value as AppRegistration['packageManager'] }); setManagerConfirmed(true) }}><option value="" disabled>{t('chooseManager')}</option>{['npm', 'pnpm', 'yarn', 'bun'].map(m => <option key={m}>{m}</option>)}</select></label>
        <label>{t('url')}<input required value={form.url} onChange={e => patch({ url: e.target.value })} /></label>
        <label>{t('port')}<input type="number" required min="1" max="65535" value={form.port} onChange={e => patch({ port: Number(e.target.value) })} /></label>
        <label>{t('strategy')}<select value={form.strategy} onChange={e => patch({ strategy: e.target.value as AppRegistration['strategy'] })}>{['fixed', 'env', 'long', 'short'].map(s => <option value={s} key={s}>{t(s as AppsKey)}</option>)}</select></label>
        <footer><button type="button" onClick={() => setForm(null)}>{t('cancel')}</button><button disabled={busy}>{t('save')}</button></footer>
      </form>}
    </dialog>
    <dialog ref={logDialog} className={css.dialog} onCancel={() => setLogs(null)}><h2>{t('logs')}</h2><pre>{logs?.stdout}{'\n'}{logs?.stderr}</pre><button onClick={() => setLogs(null)}>{t('close')}</button></dialog>
  </section>
}
