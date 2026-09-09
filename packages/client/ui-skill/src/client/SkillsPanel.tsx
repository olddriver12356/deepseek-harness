import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SkillArtifact, SkillArtifactId, SkillFileContent, SkillFileRequest, SkillFileWriteRequest, SkillInventory, SkillTreeEntry, WorkspaceId } from '@deepseek-ai/dsh-api-workspace-controller/types'
import { editField, invocationOf, readFields, type Invocation, type SkillFields } from './skill-document.ts'
import type { SkillDraft } from './creation.ts'
import type { PanelTranslate } from './panel-locales.ts'
import css from './SkillsPanel.module.css'

export interface SkillsApi {
  list(workspaceId: WorkspaceId): Promise<SkillInventory>
  tree(workspaceId: WorkspaceId, id: SkillArtifactId): Promise<readonly SkillTreeEntry[]>
  read(request: SkillFileRequest): Promise<SkillFileContent>
  write(request: SkillFileWriteRequest): Promise<SkillFileContent>
  handoff(workspaceId: WorkspaceId, draft: SkillDraft, destination: string): () => Promise<void>
}
export interface SkillsPanelProps { appPanels: IAppPanels; workspaces: IWorkspaces; sessions: ISessions; api: SkillsApi; t: PanelTranslate }
const modes: readonly Invocation[] = ['both', 'user', 'agent', 'neither']
const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)
const EMPTY: SkillInventory = { skills: [], projectDestination: '', personalDestination: '' }
const INITIAL_DRAFT: SkillDraft = { name: '', references: '', instructions: '', scope: 'project', category: '', invocation: 'both' }

function Modal({ children, title, close, closeLabel }: { children: ReactNode; title: string; close: () => void; closeLabel: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { ref.current?.showModal() }, [])
  return <dialog ref={ref} className={css.dialog} aria-label={title} onCancel={close}><header><h2>{title}</h2><button type="button" onClick={close} aria-label={closeLabel}>×</button></header>{children}</dialog>
}

function FileTree({ entries, active, onSelect, t, disabled = false, parent = '' }: { disabled?: boolean; entries: readonly SkillTreeEntry[]; active: string; onSelect: (file: string) => void; t: PanelTranslate; parent?: string }): ReactNode {
  return <ul className={css.tree}>{entries.filter(entry => (entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '') === parent).map(entry => <li key={entry.path}>{entry.kind === 'directory'
    ? <details open><summary>{entry.path.split('/').at(-1)}</summary><FileTree entries={entries} active={active} onSelect={onSelect} t={t} disabled={disabled} parent={entry.path} /></details>
    : <button type="button" disabled={disabled || entry.kind === 'blocked'} title={entry.kind === 'blocked' ? t('blocked') : entry.path} aria-current={active === entry.path ? 'page' : undefined} onClick={() => { onSelect(entry.path) }}>{entry.path.split('/').at(-1)}</button>}</li>)}</ul>
}

/** Category index, physical file tree and a single source-backed editor buffer. */
export function SkillsPanel({ appPanels, workspaces, sessions, api, t }: SkillsPanelProps): ReactNode {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const workspaceSubscribe = useCallback((listener: () => void) => workspaces.list.subscribe(listener), [workspaces])
  const sessionSubscribe = useCallback((listener: () => void) => sessions.list.subscribe(listener), [sessions])
  const workspaceState = useSyncExternalStore(workspaceSubscribe, () => workspaces.list.getSnapshot())
  const sessionState = useSyncExternalStore(sessionSubscribe, () => sessions.list.getSnapshot())
  const currentWorkspace = workspaceState.items.find(item =>
    sessionState.current !== undefined && item.sessionIds.includes(sessionState.current))?.workspaceId
  const [workspaceId, setWorkspaceId] = useState<WorkspaceId | undefined>(currentWorkspace)
  const [inventory, setInventory] = useState<SkillInventory>(EMPTY)
  const [selected, setSelected] = useState<SkillArtifact>()
  const [tree, setTree] = useState<readonly SkillTreeEntry[]>([])
  const [loaded, setLoaded] = useState<SkillFileContent>()
  const [buffer, setBuffer] = useState('')
  const [view, setView] = useState<'structured' | 'source'>('structured')
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('all')
  const [invocation, setInvocation] = useState('all')
  const [category, setCategory] = useState('all')
  const [grouped, setGrouped] = useState(true)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState<(() => void)>()
  const [creating, setCreating] = useState(false)
  const [newFile, setNewFile] = useState<string | undefined>()
  const [draft, setDraft] = useState<SkillDraft>(INITIAL_DRAFT)
  const handoff = useRef<(() => Promise<void>)>()
  const [handoffPending, setHandoffPending] = useState(false)
  const generation = useRef(0)
  const dirty = loaded?.content !== undefined && loaded.content !== null && buffer !== loaded.content
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const fields = useMemo(() => { try { return { value: readFields(buffer), error: '' } } catch (reason) { return { value: undefined, error: errorText(reason) } } }, [buffer])
  const categories = [...new Set(inventory.skills.map(skill => skill.category).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  const visible = inventory.skills.filter(skill => `${skill.name} ${skill.description}`.toLowerCase().includes(query.toLowerCase()) && (scope === 'all' || skill.scope === scope) && (invocation === 'all' || invocationOf(skill.userInvocable, skill.modelInvocable) === invocation) && (category === 'all' || skill.category === category)).sort((a, b) => a.name.localeCompare(b.name))
  const groups = grouped ? [...new Set(visible.map(skill => skill.category))].sort((a, b) => a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)) : ['']

  const refresh = useCallback(async () => {
    if (workspaceId === undefined) return
    const sequence = ++generation.current
    setBusy(true); setError('')
    try {
      const result = await api.list(workspaceId)
      if (sequence === generation.current) {
        setInventory(result); setSelected(item => result.skills.find(skill => skill.id === item?.id) ?? item)
      }
    }
    catch (reason) { if (sequence === generation.current) setError(errorText(reason)) }
    finally { if (sequence === generation.current) setBusy(false) }
  }, [workspaceId, api])
  useEffect(() => { if (active === 'skills') void refresh() }, [active, refresh])
  useEffect(() => {
    if (workspaceId === undefined && currentWorkspace !== undefined) setWorkspaceId(currentWorkspace)
  }, [workspaceId, currentWorkspace])
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirtyRef.current) event.preventDefault() }
    window.addEventListener('beforeunload', unload)
    return () => { generation.current++; window.removeEventListener('beforeunload', unload) }
  }, [])
  function navigate(action: () => void): void { if (dirty) setPending(() => action); else action() }
  function switchWorkspace(id: WorkspaceId): void {
    navigate(() => { generation.current++; setWorkspaceId(id); setSelected(undefined); setLoaded(undefined); setBuffer(''); setTree([]); setInventory(EMPTY) })
  }
  async function selectFile(item: SkillArtifact, file: string): Promise<void> {
    if (workspaceId === undefined) return
    const sequence = ++generation.current
    setBusy(true); setError(''); setStatus('')
    try {
      const [nextTree, content] = await Promise.all([api.tree(workspaceId, item.id), api.read({ workspaceId, id: item.id, file })])
      if (sequence !== generation.current) return
      setSelected(item); setTree(nextTree); setLoaded(content); setBuffer(content.content ?? ''); setView('structured')
    } catch (reason) { if (sequence === generation.current) setError(errorText(reason)) }
    finally { if (sequence === generation.current) setBusy(false) }
  }
  async function save(): Promise<boolean> {
    if (workspaceId === undefined || selected === undefined || loaded === undefined || loaded.content === null || busy) return false
    setBusy(true); setError('')
    try {
      const content = await api.write({ workspaceId, id: selected.id, file: loaded.file, content: buffer, revision: loaded.revision })
      setLoaded(content); setBuffer(content.content ?? '')
      const next = await api.list(workspaceId)
      setInventory(next); setSelected(next.skills.find(item => item.id === selected.id) ?? selected); setStatus(t('saved'))
      return true
    } catch (reason) { setError(errorText(reason)); return false }
    finally { setBusy(false) }
  }
  function changeField(key: keyof SkillFields, value: string): void {
    try { setBuffer(editField(buffer, key, value)); setStatus('') } catch (reason) { setError(errorText(reason)) }
  }
  async function addFile(): Promise<void> {
    if (workspaceId === undefined || selected === undefined || newFile === undefined || busy) return
    setBusy(true); setError('')
    try {
      const content = await api.write({ workspaceId, id: selected.id, file: newFile, content: '', revision: null })
      setTree(await api.tree(workspaceId, selected.id)); setLoaded(content); setBuffer(''); setNewFile(undefined); setView('source')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  async function submitDraft(): Promise<void> {
    if (workspaceId === undefined || busy || draft.instructions.trim() === '') return
    const destination = draft.scope === 'project' ? inventory.projectDestination : inventory.personalDestination
    if (destination === '') return
    handoff.current ??= api.handoff(workspaceId, { ...draft }, destination)
    setHandoffPending(true); setBusy(true); setError('')
    try {
      await handoff.current()
      handoff.current = undefined; setHandoffPending(false); setDraft(INITIAL_DRAFT); setCreating(false); appPanels.setActive('agent')
    } catch (reason) { setError(errorText(reason)) } finally { setBusy(false) }
  }
  const formField = (label: string, key: keyof SkillFields, multiline = false) => <label>{label}{multiline ? <textarea value={fields.value?.[key] ?? ''} rows={key === 'instructions' ? 18 : 3} onChange={(event) => { changeField(key, event.target.value) }} /> : <input value={fields.value?.[key] ?? ''} onChange={(event) => { changeField(key, event.target.value) }} list={key === 'category' ? 'skill-categories' : undefined} />}</label>

  return <section className={css.panel} hidden={active !== 'skills'} data-skills-panel aria-label={t('title')} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if (dirty) void save() } }}>
    <header className={css.header}><div className={css.titleLockup}><span className={css.titleMark} aria-hidden="true">03</span><div><h1>{t('title')}</h1><small>{t('subtitle')}</small></div></div><label>{t('workspace')}<select value={workspaceId ?? ''} disabled={busy} onChange={(event) => { switchWorkspace(event.target.value as WorkspaceId) }}><option value="" disabled>{t('chooseWorkspace')}</option>{workspaceState.items.map(item => <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>)}</select></label><button type="button" disabled={busy || workspaceId === undefined} onClick={() => { void refresh() }}>{t('refresh')}</button></header>
    <section className={css.hero}><div><p className={css.heroKicker}>{t('subtitle')}</p><h2>{t('heroLineOne')}<br /><span>{t('heroLineTwo')}</span></h2><p className={css.heroBody}>{t('heroBody')}</p></div><button className={css.heroCreate} type="button" disabled={workspaceId === undefined || busy} onClick={() => { setCreating(true) }}><span aria-hidden="true">＋</span>{t('create')}</button></section>
    {error !== ''  && <p className={css.error} role="alert">{error}</p>}
    <div className={css.workbench}>
      <aside className={css.index}><input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => { setQuery(event.target.value) }} /><div className={css.filters}><select aria-label={t('scope')} value={scope} onChange={(event) => { setScope(event.target.value) }}>{(['all', 'project', 'personal', 'other'] as const).map(value => <option key={value} value={value}>{t(value)}</option>)}</select><select aria-label={t('invocation')} value={invocation} onChange={(event) => { setInvocation(event.target.value) }}><option value="all">{t('all')}</option>{modes.map(mode => <option key={mode} value={mode}>{t(mode)}</option>)}</select><select aria-label={t('category')} value={category} onChange={(event) => { setCategory(event.target.value) }}><option value="all">{t('all')}</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}<option value="">{t('uncategorized')}</option></select><select aria-label={t('grouped')} value={grouped ? 'grouped' : 'flat'} onChange={(event) => { setGrouped(event.target.value === 'grouped') }}><option value="grouped">{t('grouped')}</option><option value="flat">{t('flat')}</option></select></div><p className={css.count}>{t('count', { count: visible.length, groups: new Set(visible.map(item => item.category)).size })}</p>
        <div className={css.list}>{groups.map((group) => {
          const items = grouped ? visible.filter(item => item.category === group) : visible
          const total = grouped ? inventory.skills.filter(item => item.category === group).length : inventory.skills.length
          const closed = grouped && collapsed.has(group) && query === ''
          return <div key={group}>{grouped && <button className={css.group} type="button" aria-expanded={!closed} onClick={() => { setCollapsed((previous) => { const next = new Set(previous); if (next.has(group)) next.delete(group); else next.add(group); return next }) }}>{closed ? '▸' : '▾'} {group || t('uncategorized')}<span>{items.length}/{total}</span></button>}{!closed && items.map(item => <button className={css.skill} type="button" key={item.id} disabled={busy} aria-pressed={selected?.id === item.id} onClick={() => { navigate(() => { void selectFile(item, item.entryFile) }) }}><strong>{item.name}</strong><small>{item.description || item.problem}</small><span>{t(item.scope)}{item.shadowed ? ` · ${t('shadowed')}` : ''}</span></button>)}</div>
        })}{visible.length === 0 && <p className={css.empty}>{busy ? t('loading') : t('empty')}</p>}</div><small className={css.notice}>{t('inventoryNotice')}</small>
      </aside>
      <aside className={css.files}><header><strong>{t('files')}</strong><button type="button" disabled={selected === undefined || !selected.writable || !selected.bundle || busy} onClick={() => { navigate(() => { setNewFile('') }) }}>＋<span className={css.srOnly}>{t('addFile')}</span></button></header>{selected !== undefined && <><code className={css.path}>{selected.canonicalPath}</code><FileTree disabled={busy} entries={tree} active={loaded?.file ?? ''} onSelect={(file) => { if (!busy) navigate(() => { void selectFile(selected, file) }) }} t={t} /></>}</aside>
      <main className={css.editor}>{selected === undefined || loaded === undefined ? <div className={css.empty}><span aria-hidden="true">✳</span><h2>{t('select')}</h2></div> : <><header><div><strong>{loaded.file}</strong><small>{selected.source} · {selected.shadowed ? t('shadowed') : t('effective')}{!selected.writable ? ` · ${t('readonly')}` : ''}</small></div><span role="status">{dirty ? t('unsaved') : status}</span>{loaded.file === selected.entryFile && <button type="button" onClick={() => { setView(view === 'source' ? 'structured' : 'source') }}>{view === 'source' ? t('structured') : t('source')}</button>}<button className={css.primary} type="button" disabled={!dirty || busy || !selected.writable} onClick={() => { void save() }}>{busy ? t('saving') : t('save')}</button></header>
        {loaded.content === null ? <p className={css.empty}>{t('binary')} ({loaded.bytes})</p> : <fieldset className={css.document} disabled={!selected.writable || busy}>{view === 'structured' && loaded.file === selected.entryFile && fields.value !== undefined ? <><div className={css.fieldGrid}>{formField(t('name'), 'name')}{formField(t('category'), 'category')}</div>{formField(t('description'), 'description', true)}<label>{t('invocation')}<select value={fields.value.invocation} onChange={(event) => { changeField('invocation', event.target.value) }}>{modes.map(mode => <option key={mode} value={mode}>{t(mode)}</option>)}</select></label>{formField(t('instructions'), 'instructions', true)}</> : <>{view === 'structured' && loaded.file === selected.entryFile && fields.error !== '' && <p role="alert">{t('sourceProblem')} {fields.error}</p>}<label className={css.source}>{t('source')}<textarea aria-label={t('source')} spellCheck={false} value={buffer} onChange={(event) => { setBuffer(event.target.value); setStatus('') }} /></label></>}</fieldset>}</> }</main>
    </div><datalist id="skill-categories">{categories.map(value => <option key={value} value={value} />)}</datalist>
    {pending !== undefined && <Modal closeLabel={t('close')} title={t('leave')} close={() => { setPending(undefined) }}><p>{t('leaveBody')}</p><footer><button type="button" disabled={busy} onClick={() => { setPending(undefined) }}>{t('stay')}</button><button type="button" disabled={busy} onClick={() => { setBuffer(loaded?.content ?? ''); setPending(undefined); pending() }}>{t('discard')}</button><button type="button" disabled={busy} onClick={() => { void save().then((ok) => { if (ok) { setPending(undefined); pending() } }) }}>{t('save')}</button></footer></Modal>}
    {newFile !== undefined && <Modal closeLabel={t('close')} title={t('addFile')} close={() => { if (!busy) setNewFile(undefined) }}><form onSubmit={(event) => { event.preventDefault(); void addFile() }}><label>{t('filePath')}<input required placeholder={t('newFileHint')} value={newFile} onChange={(event) => { setNewFile(event.target.value) }} /></label>{error !== '' && <p role="alert">{error}</p>}<footer><button type="submit" disabled={busy}>{t('add')}</button></footer></form></Modal>}
    {creating && <Modal closeLabel={t('close')} title={t('create')} close={() => { if (!busy) setCreating(false) }}><p>{t('createBody')}</p><form onSubmit={(event) => { event.preventDefault(); void submitDraft() }}><fieldset disabled={busy || handoffPending}><label>{t('optionalName')}<input value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }) }} /></label><label>{t('references')}<textarea rows={3} value={draft.references} onChange={(event) => { setDraft({ ...draft, references: event.target.value }) }} /></label><label>{t('draft')}<textarea required rows={6} value={draft.instructions} onChange={(event) => { setDraft({ ...draft, instructions: event.target.value }) }} /></label><div className={css.fieldGrid}><label>{t('scope')}<select value={draft.scope} onChange={(event) => { setDraft({ ...draft, scope: event.target.value as SkillDraft['scope'] }) }}><option value="project">{t('project')}</option><option value="personal">{t('personal')}</option></select></label><label>{t('invocation')}<select value={draft.invocation} onChange={(event) => { setDraft({ ...draft, invocation: event.target.value as Invocation }) }}>{modes.map(mode => <option key={mode} value={mode}>{t(mode)}</option>)}</select></label></div><label>{t('category')}<input list="skill-categories" value={draft.category} onChange={(event) => { setDraft({ ...draft, category: event.target.value }) }} /></label></fieldset><p>{t('destination')}<code className={css.path}>{draft.scope === 'project' ? inventory.projectDestination : inventory.personalDestination}</code></p>{handoffPending && <p>{t('creationPending')}</p>}{error !== '' && <p role="alert">{error}</p>}<footer><button className={css.primary} type="submit" disabled={busy || draft.instructions.trim() === ''}>{busy ? t('sending') : handoffPending ? t('retry') : t('draftSession')}</button></footer></form></Modal>}
  </section>
}
