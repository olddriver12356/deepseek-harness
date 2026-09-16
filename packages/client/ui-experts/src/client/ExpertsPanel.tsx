import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { useEntranceMotion } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { ExpertDraft, ExpertExecution, ExpertRecord, ExpertStatus } from '@deepseek-ai/dsh-host-experts/types'
import type { StyleRecord } from '@deepseek-ai/dsh-host-styles/types'
import type { ExpertLocaleKey } from './locales.ts'
import css from './ExpertsPanel.module.css'

export type ExpertTranslate = (key: ExpertLocaleKey, params?: Record<string, unknown>) => string

export interface ExpertApi {
  list(): Promise<readonly ExpertRecord[]>
  create(expert: ExpertDraft): Promise<ExpertRecord>
  update(id: string, expert: ExpertDraft): Promise<ExpertRecord>
  remove(id: string): Promise<void>
  listStyles(): Promise<readonly StyleRecord[]>
  dispatch(expert: ExpertRecord, task: string, style: StyleRecord | undefined): Promise<void>
}

export interface ExpertsPanelProps {
  readonly appPanels: IAppPanels
  readonly api: ExpertApi
  readonly t: ExpertTranslate
}

type DialogState =
  | { readonly kind: 'record'; readonly item?: ExpertRecord; readonly copy?: boolean }
  | { readonly kind: 'dispatch'; readonly item: ExpertRecord }
  | undefined

const REASONING_LEVELS = ['inherit', 'low', 'medium', 'high'] as const
const EXECUTIONS = ['conversational', 'delegated'] as const

/** The roster filter widens `ExpertExecution` with an unfiltered choice. */
type ExecutionFilter = ExpertExecution | 'all'
const EXECUTION_FILTERS = ['all', ...EXECUTIONS] as const

/** localStorage key for the last applied execution filter. */
const FILTER_PREF_KEY = 'dsh.experts.executionFilter'

/**
 * Read the persisted execution filter. Durable-storage boundary: a missing or
 * unrecognized value resolves to `all`, because a filter that silently hides
 * the roster is worse than losing the preference.
 * @returns the stored filter, or `all` when unset or invalid.
 */
function readFilterPreference(): ExecutionFilter {
  const raw = localStorage.getItem(FILTER_PREF_KEY)
  return EXECUTION_FILTERS.find(mode => mode === raw) ?? 'all'
}
function statuses(t: ExpertTranslate): readonly { value: ExpertStatus; label: string }[] {
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
  const [opened, setOpened] = useState(false)
  const ref = useEntranceMotion<HTMLDialogElement>(opened, 0, 'dialog')
  useEffect(() => {
    if (ref.current !== null && !ref.current.open) ref.current.showModal()
    setOpened(true)
  }, [])
  return ref
}

function draftFromForm(form: HTMLFormElement): ExpertDraft {
  const data = new FormData(form)
  const value = (key: string): string => {
    const entry = data.get(key)
    return typeof entry === 'string' ? entry.trim() : ''
  }
  return {
    name: value('name'),
    category: value('category'),
    description: value('description'),
    instructions: value('instructions'),
    status: value('status') as ExpertStatus,
    execution: (value('execution') || 'conversational') as ExpertExecution,
    model: value('model') || 'inherit',
    reasoning: value('reasoning') || 'inherit',
  }
}

function ExpertCard({ item, index, onOpen, onDelete, t }: {
  readonly item: ExpertRecord
  readonly index: number
  readonly onOpen: (state: DialogState) => void
  readonly onDelete: (item: ExpertRecord) => void
  readonly t: ExpertTranslate
}): ReactNode {
  const callable = item.status === 'approved'
  // A delegated Expert is started by the main Agent as a tool inside a turn, so
  // the panel offers no turn-external dispatch for it. Management actions stay:
  // the record is still authored and curated here.
  const dispatchable = item.execution !== 'delegated'
  return (
    <article data-entrance-card className={`${css.recordCard} ${callable ? '' : css.disabled}`} data-index={String(index + 1).padStart(2, '0')}>
      <div className={css.recordTop}>
        <span className={css.recordAvatar}>{item.name.slice(0, 1)}</span>
        <span className={css.recordStatus}>{callable ? t('onCall') : t(item.status)}</span>
        {item.execution === 'delegated' && <span className={css.recordStatus}>{t('delegatedBadge')}</span>}
      </div>
      <h3>{item.name}</h3>
      <p>{item.description}</p>
      <div className={css.recordActions}>
        {dispatchable && <button className={css.call} disabled={!callable} type="button" onClick={() => { onOpen({ kind: 'dispatch', item }) }}>{t('call')}</button>}
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
  readonly onSave: (draft: ExpertDraft, id?: string) => Promise<void>
  readonly t: ExpertTranslate
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
    <dialog className={css.dialog} ref={dialogRef} onClose={onClose} aria-labelledby="experts-record-title">
      <form onSubmit={(event) => { void submit(event) }}>
        <header><div><p>{item === undefined ? t('newRecord') : copy ? t('copyRecord') : t('editRecord')}</p><h2 id="experts-record-title">{title}</h2></div><button type="button" className={css.dialogClose} onClick={onClose} aria-label={t('close')}>×</button></header>
        <label>{t('name')}<input name="name" defaultValue={item === undefined ? '' : `${item.name}${copy ? t('copySuffix') : ''}`} maxLength={80} required /></label>
        <label>{t('category')}<input name="category" defaultValue={item?.category ?? ''} maxLength={40} required /></label>
        <label>{t('description')}<input name="description" defaultValue={item?.description ?? ''} maxLength={180} required /></label>
        <label>{t('status')}<select name="status" defaultValue={copy ? 'draft' : item?.status ?? 'draft'}>{statuses(t).map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label>{t('execution')}<select name="execution" defaultValue={item?.execution ?? 'conversational'}>{EXECUTIONS.map(mode => <option key={mode} value={mode}>{t(mode === 'delegated' ? 'executionDelegated' : 'executionConversational')}</option>)}</select></label>
        <label>{t('model')}<input name="model" defaultValue={item?.model ?? 'inherit'} maxLength={60} /></label>
        <label>{t('reasoning')}<select name="reasoning" defaultValue={item?.reasoning ?? 'inherit'}>{REASONING_LEVELS.map(level => <option key={level} value={level}>{level}</option>)}</select></label>
        <label>{t('instructions')}<textarea name="instructions" defaultValue={item?.instructions ?? ''} rows={9} required /></label>
        <p className={css.formNotice}>{t('capabilityNotice')}</p>
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        <footer><button type="button" className={css.ghostButton} onClick={onClose}>{t('cancel')}</button><button type="submit" className={css.primaryCut} disabled={saving}>{saving ? t('saving') : t('save')}</button></footer>
      </form>
    </dialog>
  )
}

function DispatchDialog({ item, onClose, onDispatch, listStyles, t }: {
  readonly item: ExpertRecord
  readonly onClose: () => void
  readonly onDispatch: (task: string, style: StyleRecord | undefined) => Promise<void>
  readonly listStyles: () => Promise<readonly StyleRecord[]>
  readonly t: ExpertTranslate
}): ReactNode {
  const dialogRef = useModalDialog()
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [styles, setStyles] = useState<readonly StyleRecord[]>([])
  useEffect(() => {
    let cancelled = false
    listStyles().then((loaded) => { if (!cancelled) setStyles(loaded.filter(style => style.status === 'approved')) }).catch(() => {})
    return () => { cancelled = true }
  }, [listStyles])
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const taskValue = data.get('task')
    const styleValue = data.get('style')
    const task = typeof taskValue === 'string' ? taskValue.trim() : ''
    const styleId = typeof styleValue === 'string' ? styleValue : ''
    if (task === '') return
    setSending(true)
    setError('')
    try { await onDispatch(task, styles.find(style => style.id === styleId)) }
    catch (reason) { setError(errorMessage(reason)); setSending(false) }
  }
  return (
    <dialog className={css.dialog} ref={dialogRef} onClose={onClose} aria-labelledby="experts-dispatch-title">
      <form onSubmit={(event) => { void submit(event) }}>
        <header><div><p>{t('dispatchKicker')}</p><h2 id="experts-dispatch-title">{t('dispatchTitle')}</h2></div><button type="button" className={css.dialogClose} onClick={onClose} aria-label={t('close')}>×</button></header>
        <div className={css.dispatchBadge}>{item.name}</div>
        <label>{t('style')}<select name="style" defaultValue="">
          <option value="">{t('styleNone')}</option>
          {styles.map(style => <option key={style.id} value={style.id}>{style.name}</option>)}
        </select></label>
        <label>{t('task')}<textarea name="task" rows={7} required /></label>
        <p className={css.formNotice}>{t(item.execution === 'delegated' ? 'dispatchNoticeDelegated' : 'dispatchNotice')}</p>
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        <footer><button type="button" className={css.ghostButton} onClick={onClose}>{t('cancel')}</button><button type="submit" className={css.primaryCut} disabled={sending}>{sending ? t('sending') : t('send')}</button></footer>
      </form>
    </dialog>
  )
}

export function ExpertsPanel({ appPanels, api, t }: ExpertsPanelProps): ReactNode {
  const activePanel = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const entranceRef = useEntranceMotion<HTMLElement>(activePanel === 'experts')
  const [cardsReady, setCardsReady] = useState(false)
  const cardsRef = useEntranceMotion<HTMLDivElement>(activePanel === 'experts' && cardsReady, 0, 'cards')
  useEffect(() => { if (activePanel !== 'experts') setCardsReady(false) }, [activePanel])
  const [records, setRecords] = useState<readonly ExpertRecord[]>([])
  const [query, setQuery] = useState('')
  const [execution, setExecution] = useState<ExecutionFilter>(readFilterPreference)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [dialog, setDialog] = useState<DialogState>()
  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setRecords(await api.list()); setCardsReady(true) }
    catch (reason) { setError(errorMessage(reason)) }
    finally { setLoading(false) }
  }, [api])
  useEffect(() => { if (activePanel === 'experts') void refresh() }, [activePanel, refresh])
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return records.filter(item =>
      (execution === 'all' || item.execution === execution)
      && (needle === '' || `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(needle)))
  }, [execution, query, records])

  /** Persist the applied filter so the next visit opens on the same view. */
  function applyExecutionFilter(next: ExecutionFilter): void {
    setExecution(next)
    localStorage.setItem(FILTER_PREF_KEY, next)
  }

  async function save(draft: ExpertDraft, id?: string): Promise<void> {
    if (id === undefined) await api.create(draft)
    else await api.update(id, draft)
    await refresh()
    setDialog(undefined)
  }

  async function remove(item: ExpertRecord): Promise<void> {
    if (!window.confirm(t('deleteConfirm', { name: item.name }))) return
    try { await api.remove(item.id); await refresh() }
    catch (reason) { setError(errorMessage(reason)) }
  }

  return (
    <section className={css.panel} data-experts-panel hidden={activePanel !== 'experts'} aria-label={t('regionAria')}>
      <header className={css.header}>
        <div className={css.titleLockup}>
          <span className={css.titleMark}>04</span>
          <div><strong>{t('title')}</strong><small>{t('subtitle')}</small></div>
        </div>
        <span className={css.readOnly}>{t('live')}</span>
      </header>
      <div className={css.viewport}><main ref={entranceRef} className={css.content}>
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
          <select
            aria-label={t('filterAria')}
            className={css.filterCut}
            onChange={(event) => { applyExecutionFilter(event.currentTarget.value as ExecutionFilter) }}
            value={execution}
          >
            {EXECUTION_FILTERS.map(mode => (
              <option key={mode} value={mode}>
                {t(mode === 'all' ? 'filterAll' : mode === 'delegated' ? 'executionDelegated' : 'executionConversational')}
              </option>
            ))}
          </select>
          <span>{t('count', { count: visible.length })}</span>
        </div>
        {error !== '' && <p className={css.formError} role="alert">{error}</p>}
        <div ref={cardsRef} className={css.expertGrid}>
          {loading
            ? <div className={css.emptyRecords}><strong>{t('loading')}</strong></div>
            : visible.length === 0
              ? <div className={css.emptyRecords}><strong>{t('empty')}</strong><p>{t('emptyHint')}</p></div>
              : visible.map((item, index) => (
                <ExpertCard
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
      {dialog?.kind === 'dispatch' && (
        <DispatchDialog
          item={dialog.item}
          listStyles={() => api.listStyles()}
          onClose={() => { setDialog(undefined) }}
          onDispatch={async (task, style) => { await api.dispatch(dialog.item, task, style); setDialog(undefined) }}
          t={t}
        />
      )}
    </section>
  )
}
