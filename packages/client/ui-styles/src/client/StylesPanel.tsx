import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { StyleDraft, StyleRecord, StyleStatus } from '@deepseek-ai/dsh-host-styles/types'
import type { StyleLocaleKey } from './locales.ts'
import css from './StylesPanel.module.css'

export type StyleTranslate = (key: StyleLocaleKey, params?: Record<string, unknown>) => string

export interface StyleApi {
  list(): Promise<readonly StyleRecord[]>
  create(style: StyleDraft): Promise<StyleRecord>
  update(id: string, style: StyleDraft): Promise<StyleRecord>
  remove(id: string): Promise<void>
  dispatch(style: StyleRecord, task: string): Promise<void>
}

export interface StylesPanelProps {
  readonly appPanels: IAppPanels
  readonly api: StyleApi
  readonly t: StyleTranslate
}

type DialogState =
  | { readonly kind: 'record'; readonly item?: StyleRecord; readonly copy?: boolean }
  | { readonly kind: 'dispatch'; readonly item: StyleRecord }
  | undefined

function statuses(t: StyleTranslate): readonly { value: StyleStatus; label: string }[] {
  return [
    { value: 'draft', label: t('draft') },
    { value: 'approved', label: t('approved') },
    { value: 'suspended', label: t('suspended') },
  ]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (ref.current !== null && !ref.current.open) ref.current.showModal()
  }, [])
  return ref
}

function draftFromForm(form: HTMLFormElement): StyleDraft {
  const data = new FormData(form)
  const value = (key: string): string => {
    const entry = data.get(key)
    return typeof entry === 'string' ? entry.trim() : ''
  }
  return {
    name: value('name'),
    description: value('description'),
    instructions: value('instructions'),
    status: value('status') as StyleStatus,
  }
}

function StyleCard({ item, index, onOpen, onDelete, t }: {
  readonly item: StyleRecord
  readonly index: number
  readonly onOpen: (state: DialogState) => void
  readonly onDelete: (item: StyleRecord) => void
  readonly t: StyleTranslate
}): ReactNode {
  const callable = item.status === 'approved'
  return (
    <article className={`${css.recordCard} ${callable ? '' : css.disabled}`} data-index={String(index + 1).padStart(2, '0')}>
      <div className={css.styleSwatch} />
      <div className={css.recordTop}>
        <span className={css.recordStatus}>{callable ? t('onCall') : t(item.status)}</span>
      </div>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <div className={css.recordActions}>
        <button className={css.call} disabled={!callable} type="button" onClick={() => { onOpen({ kind: 'dispatch', item }) }}>{t('call')}</button>
        <button type="button" onClick={() => { onOpen({ kind: 'record', item }) }}>{t('edit')}</button>
        <button type="button" onClick={() => { onOpen({ kind: 'record', item, copy: true }) }}>{t('copy')}</button>
        <button type="button" onClick={() => { onDelete(item) }}>{t('delete')}</button>
      </div>
    </article>
  )
}

function RecordDialog({ state, onClose, onSave, t }: {
  readonly state: Extract<DialogState, { kind: 'record' }>
  readonly onClose: () => void
  readonly onSave: (draft: StyleDraft, id?: string) => Promise<void>
  readonly t: StyleTranslate
}): ReactNode {
  const dialogRef = useModalDialog()
  const item = state.item
  const copy = state.copy === true
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const title = item === undefined ? t('createTitle') : copy ? t('copyTitle') : t('editTitle')

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError('')
    try { await onSave(draftFromForm(event.currentTarget), copy ? undefined : item?.id) }
    catch (reason) { setError(errorMessage(reason)); setSaving(false) }
  }

  return (
    <dialog className={css.dialog} ref={dialogRef} aria-labelledby="styles-record-title">
      <form onSubmit={(event) => { void submit(event) }}>
        <header><div><p>{item === undefined ? t('newRecord') : copy ? t('copyRecord') : t('editRecord')}</p><h2 id="styles-record-title">{title}</h2></div><button type="button" className={css.dialogClose} onClick={onClose} aria-label={t('close')}>×</button></header>
        <label>{t('name')}<input name="name" defaultValue={item === undefined ? '' : `${item.name}${copy ? t('copySuffix') : ''}`} maxLength={80} required /></label>
        <label>{t('description')}<input name="description" defaultValue={item?.description ?? ''} maxLength={180} required /></label>
        <label>{t('status')}<select name="status" defaultValue={copy ? 'draft' : item?.status ?? 'draft'}>{statuses(t).map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label>{t('instructions')}<textarea name="instructions" defaultValue={item?.instructions ?? ''} rows={9} required /></label>
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        <footer><button type="button" className={css.ghostButton} onClick={onClose}>{t('cancel')}</button><button type="submit" className={css.primaryCut} disabled={saving}>{saving ? t('saving') : t('save')}</button></footer>
      </form>
    </dialog>
  )
}

function DispatchDialog({ item, onClose, onDispatch, t }: {
  readonly item: StyleRecord
  readonly onClose: () => void
  readonly onDispatch: (task: string) => Promise<void>
  readonly t: StyleTranslate
}): ReactNode {
  const dialogRef = useModalDialog()
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const taskValue = data.get('task')
    const task = typeof taskValue === 'string' ? taskValue.trim() : ''
    if (task === '') return
    setSending(true)
    setError('')
    try { await onDispatch(task) }
    catch (reason) { setError(errorMessage(reason)); setSending(false) }
  }
  return (
    <dialog className={css.dialog} ref={dialogRef} aria-labelledby="styles-dispatch-title">
      <form onSubmit={(event) => { void submit(event) }}>
        <header><div><p>{t('dispatchKicker')}</p><h2 id="styles-dispatch-title">{t('dispatchTitle')}</h2></div><button type="button" className={css.dialogClose} onClick={onClose} aria-label={t('close')}>×</button></header>
        <div className={css.dispatchBadge}>{item.name}</div>
        <label>{t('task')}<textarea name="task" rows={7} required /></label>
        <p className={css.formNotice}>{t('dispatchNotice')}</p>
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        <footer><button type="button" className={css.ghostButton} onClick={onClose}>{t('cancel')}</button><button type="submit" className={css.primaryCut} disabled={sending}>{sending ? t('sending') : t('send')}</button></footer>
      </form>
    </dialog>
  )
}

export function StylesPanel({ appPanels, api, t }: StylesPanelProps): ReactNode {
  const activePanel = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [records, setRecords] = useState<readonly StyleRecord[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<DialogState>()
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setRecords(await api.list()) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setLoading(false) }
  }, [api])
  useEffect(() => { if (activePanel === 'styles') void refresh() }, [activePanel, refresh])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return records.filter(item => needle === '' || `${item.name} ${item.description}`.toLowerCase().includes(needle))
  }, [query, records])

  async function save(draft: StyleDraft, id?: string): Promise<void> {
    if (id === undefined) await api.create(draft)
    else await api.update(id, draft)
    await refresh()
    setDialog(undefined)
  }

  async function remove(item: StyleRecord): Promise<void> {
    if (!window.confirm(t('deleteConfirm', { name: item.name }))) return
    try { await api.remove(item.id); await refresh() }
    catch (reason) { setError(errorMessage(reason)) }
  }

  return (
    <section className={css.panel} data-styles-panel hidden={activePanel !== 'styles'} aria-label={t('regionAria')}>
      <header className={css.header}>
        <div className={css.titleLockup}>
          <span className={css.titleMark}>04</span>
          <div><strong>{t('title')}</strong><small>{t('subtitle')}</small></div>
        </div>
        <span className={css.readOnly}>{t('live')}</span>
      </header>
      <div className={css.viewport}><main className={css.content}>
        <section className={css.collectionHero}><div><p className={css.sectionKicker}>{t('heroKicker')}</p><h1>{t('heroLineOne')}<br /><span>{t('heroLineTwo')}</span></h1><p>{t('heroBody')}</p></div><button className={css.giantAdd} type="button" onClick={() => { setDialog({ kind: 'record' }) }}>＋<span>{t('add')}</span></button></section>
        <div className={css.collectionToolbar}>
          <label className={css.searchCut}>
            <span>⌕</span>
            <input
              aria-label={t('searchAria')}
              onChange={(event) => { setQuery(event.currentTarget.value) }}
              placeholder={t('searchPlaceholder')}
              value={query}
            />
          </label>
          <span>{t('count', { count: visible.length })}</span>
        </div>
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        <div className={css.styleGrid}>
          {loading
            ? <div className={css.emptyRecords}><strong>{t('loading')}</strong></div>
            : visible.length === 0
              ? <div className={css.emptyRecords}><strong>{t('empty')}</strong><p>{t('emptyHint')}</p></div>
              : visible.map((item, index) => (
                <StyleCard
                  item={item}
                  index={index}
                  key={item.id}
                  onDelete={(selected) => { void remove(selected) }}
                  onOpen={setDialog}
                  t={t}
                />
              ))}
        </div>
      </main></div>
      {dialog?.kind === 'record' && <RecordDialog onClose={() => { setDialog(undefined) }} onSave={save} state={dialog} t={t} />}
      {dialog?.kind === 'dispatch' && <DispatchDialog item={dialog.item} onClose={() => { setDialog(undefined) }} onDispatch={async (task) => { await api.dispatch(dialog.item, task); setDialog(undefined) }} t={t} />}
    </section>
  )
}
