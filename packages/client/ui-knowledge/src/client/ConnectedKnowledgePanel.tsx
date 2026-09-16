import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { KnowledgeDocument, KnowledgeId, KnowledgeRecord, KnowledgeReviewRequest, KnowledgePreviewRequest, KnowledgePromotionPreview, KnowledgePromoteRequest, KnowledgeShelveRequest } from '@deepseek-ai/dsh-host-knowledge/types'
import { KnowledgePanel } from './KnowledgePanel.tsx'
import type { KnowledgeLocaleKey } from './locales.ts'
import type { KnowledgeSnapshot } from './types.ts'
import css from './KnowledgePanel.module.css'

type Translate = (key: KnowledgeLocaleKey) => string
export interface KnowledgeApi {
  raw(id: KnowledgeId): Promise<KnowledgeDocument>
  learn(request: import('@deepseek-ai/dsh-host-knowledge/types').KnowledgeLearnRequest): Promise<KnowledgeDocument>
  list(): Promise<readonly KnowledgeRecord[]>
  read(id: KnowledgeId): Promise<KnowledgeDocument>
  distill(id: KnowledgeId): Promise<KnowledgeDocument>
  review(request: KnowledgeReviewRequest): Promise<KnowledgeDocument>
  preview(request: KnowledgePreviewRequest): Promise<KnowledgePromotionPreview>
  promote(request: KnowledgePromoteRequest): Promise<KnowledgeDocument>
  shelve(request: KnowledgeShelveRequest): Promise<KnowledgeDocument>
}
const LAYERS = [
  { id: 'intake', ordinal: 1, labelKey: 'intake' },
  { id: 'ai-processing', ordinal: 2, labelKey: 'processing' },
  { id: 'knowledge', ordinal: 3, labelKey: 'knowledge' },
] as const

export function ConnectedKnowledgePanel({ appPanels, api, t }: {
  readonly appPanels: IAppPanels
  readonly api: KnowledgeApi
  readonly t: Translate
}) {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [records, setRecords] = useState<readonly KnowledgeRecord[]>([])
  const [document, setDocument] = useState<KnowledgeDocument>()
  const [readerId, setReaderId] = useState<string>()
  const [history, setHistory] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [revision, setRevision] = useState(0)
  const readVersion = useRef(0)
  const [busy, setBusy] = useState(false)
  const mutation = useRef(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (active !== 'knowledge') return
    let disposed = false
    setLoading(true); setError('')
    void api.list().then((value) => { if (!disposed) setRecords(value) }, (cause: unknown) => {
      if (!disposed) setError(String(cause))
    }).finally(() => { if (!disposed) setLoading(false) })
    return () => { disposed = true; readVersion.current++ }
  }, [active, api, revision])
  const open = async (id: string): Promise<void> => {
    const version = ++readVersion.current
    setReaderId(id)
    setReading(true)
    setDocument(undefined)
    setError('')
    try {
      const result = await api.read(id as KnowledgeId)
      if (version === readVersion.current) setDocument(result)
    } catch (cause) { if (version === readVersion.current) setError(String(cause)) }
    finally { if (version === readVersion.current) setReading(false) }
  }
  const act = async (operation: () => Promise<KnowledgeDocument>): Promise<void> => {
    if (mutation.current) return
    mutation.current = true; setBusy(true); setError('')
    const version = readVersion.current
    try {
      const result = await operation()
      if (version === readVersion.current) { setDocument(result); setReaderId(result.id) }
    } catch (cause) { if (version === readVersion.current) setError(String(cause)) }
    finally { mutation.current = false; setBusy(false); setRevision(value => value + 1) }
  }
  useEffect(() => {
    if (readerId !== undefined && dialogRef.current !== null && !dialogRef.current.open) dialogRef.current.showModal()
  }, [readerId])
  const close = (): void => {
    setHistory([])
    readVersion.current++
    setReaderId(undefined)
    setReading(false)
    setError('')
    setDocument(undefined)
  }
  const navigate = (id: string): void => {
    if (readerId) setHistory(values => [...values, readerId])
    void open(id)
  }
  const labels = useMemo(() => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }), [t])
  const snapshot: KnowledgeSnapshot = {
    layers: LAYERS.map(layer => ({ ...layer, label: t(layer.labelKey) })),
    featuredArtifactId: records[0]?.id ?? '',
    artifacts: records.map(record => ({
      id: record.id, title: record.title, updatedAt: record.updatedAt,
      summary: `${t(`state_${record.workflow}`)} · ${record.topics.join(', ')}`,
      layerId: record.layer === '1 Intake' ? 'intake' : record.layer === '2 AI Processing' ? 'ai-processing' : 'knowledge',
      state: record.status === 'rejected' ? 'REJECTED'
        : record.layer === '3 Knowledge' ? 'ACTIVE' : record.layer === '2 AI Processing' ? 'PROCESSING' : 'PENDING',
    })),
  }
  return <KnowledgePanel appPanels={appPanels} snapshot={snapshot} t={t} onOpen={(id) => { void open(id) }}>
    <button type="button" disabled={loading} onClick={() => { setRevision(value => value + 1) }}>{t('refresh')}</button>
    {loading && <p role="status">{t('loading')}</p>}
    {error && readerId === undefined && <p role="alert">{error}</p>}
    {readerId !== undefined && <dialog ref={dialogRef} className={css.reader} aria-label={t('reader')} onClose={close}>
      <header className={css.readerHeader}><div><p>{document?.topics.join(' · ') ?? t('reader')}</p><h2>{document?.title ?? records.find(record => record.id === readerId)?.title ?? t('reader')}</h2></div><div>
        {history.length > 0 && <button type="button" onClick={() => { const previous = history.at(-1); setHistory(values => values.slice(0, -1)); if (previous) void open(previous) }}>{t('back')}</button>}
        <button type="button" className={css.readerClose} onClick={() => { dialogRef.current?.close() }} aria-label={t('close')}>×</button>
      </div></header>
      <div className={css.readerBody}>
        {reading && <p role="status">{t('loading')}</p>}
        {error && <p role="alert">{error}</p>}
        {!reading && <button type="button" disabled={busy} onClick={() => { void open(readerId) }}>{t('refresh')}</button>}
        {document && <>
          <article className={css.markdownBody}>
            {document.content ? <MarkdownText text={document.content} labels={labels} />
              : document.evidence ? <EvidenceReader text={document.evidence} t={t} />
                : <MarkdownText text={document.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '')} labels={labels} />}
          </article>
          <section className={css.workflow} aria-label={t('review')}>
            <p role="status">{t(`state_${document.workflow}`)}</p>
            {(['pending', 'processed', 'failed', 'rejected'].includes(document.workflow)) && <button type="button" disabled={busy}
              title={t('distillNotice')} onClick={() => { void act(() => api.distill(document.id)) }}>{t(document.workflow === 'pending' ? 'distill' : 'retry')}</button>}
            {document.layer === '1 Intake' && document.workflow !== 'processing' && <button type="button" disabled={busy} onClick={() => {
              void act(() => api.shelve({ id: document.id, revision: document.revision, shelved: document.workflow !== 'shelved' }))
            }}>{t(document.workflow === 'shelved' ? 'restore' : 'shelve')}</button>}
            {busy && <p role="status">{t('working')}</p>}
            {(document.workflow === 'awaiting-review' || document.layer === '3 Knowledge' && !document.reviewed) && <fieldset disabled={busy}>
              <legend>{t('review')}</legend>
              <button type="button" onClick={() => { void act(() => api.review({ id: document.id, revision: document.revision, decision: 'accept' })) }}>{t('accept')}</button>
              <button type="button" onClick={() => { void act(() => api.review({ id: document.id, revision: document.revision, decision: 'reject' })) }}>{t('reject')}</button>
            </fieldset>}
            {document.layer === '3 Knowledge' && document.workflow === 'accepted' && <>
              <p>{t(document.reviewed ? 'reviewed' : 'unreviewed')} · {t(document.learned ? 'learned' : 'toLearn')}</p>
              {document.suggestedDestination && <p>{t('suggestedDestination')}: {document.suggestedDestination}</p>}
              {!document.publishedTo && <button type="button" disabled={busy} onClick={() => { void act(() => api.learn({ id: document.id, revision: document.revision, learned: !document.learned })) }}>{t(document.learned ? 'toLearn' : 'markLearned')}</button>}
              {document.learned && !document.publishedTo && <PromotionControls
                key={document.revision} document={document} api={api} t={t} busy={busy} act={act} />}
              {document.publishedTo && <p>{t('filed')}: {document.publishedTo}</p>}
            </>}
            <nav className={css.related} aria-label={t('related')}>
              {document.derivedFrom.map(source => <button type="button" key={source.id} onClick={() => { navigate(source.id) }}>{t('openSource')} · {records.find(record => record.id === source.id)?.title ?? source.id}</button>)}
              {records.filter(record => record.derivedFrom.some(source => source.id === document.id)).map(record => <button type="button" key={record.id} onClick={() => { navigate(record.id) }}>{record.title} · {t(`state_${record.workflow}`)}</button>)}
            </nav>
            <RawEvidence key={document.id} id={document.id} api={api} t={t} />
          </section>
        </>}
      </div>
    </dialog>}
  </KnowledgePanel>
}

function RawEvidence({ id, api, t }: { id: KnowledgeId; api: KnowledgeApi; t: Translate }) {
  const [raw, setRaw] = useState<KnowledgeDocument>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(false)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const load = async (): Promise<void> => {
    setPending(true); setError('')
    try { const result = await api.raw(id); if (alive.current) setRaw(result) }
    catch (cause) { if (alive.current) setError(String(cause)) }
    finally { if (alive.current) setPending(false) }
  }
  return <details onToggle={(event) => { setExpanded(event.currentTarget.open) }}><summary>{t('evidence')}</summary>
    {expanded && <>
      {!raw && <button type="button" disabled={pending} onClick={() => { void load() }}>{t(pending ? 'loading' : 'loadSource')}</button>}
      {error && <p role="alert">{error}</p>}
      {raw && <pre>{raw.evidence || raw.markdown || raw.content}</pre>}
    </>}
  </details>
}

function EvidenceReader({ text, t }: { text: string; t: Translate }) {
  const labels = useMemo(() => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied') }, footnotes: t('footnotes') }), [t])
  const messages = useMemo(() => {
    const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
    const result: { role: string; text: string }[] = []
    for (const line of text.split('\n')) {
      let row: unknown
      try { row = JSON.parse(line) as unknown } catch { continue /* Non-JSON evidence is rendered as Markdown below. */ }
      if (!object(row) || !object(row.data)) continue
      const message = row.type === 'user/message' ? row.data
        : row.type === 'assistant/message' ? row.data.message : undefined
      if (!object(message) || !Array.isArray(message.content)) continue
      if (row.type === 'user/message' && (!object(message.source) || message.source.kind !== 'user')) continue
      const body = message.content.filter((block: unknown): block is { type: string; text: string } => object(block) && block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n\n')
      if (body) result.push({ role: row.type === 'user/message' ? 'USER' : 'ASSISTANT', text: body })
    }
    return result
  }, [text])
  return messages.length > 0 ? <>
    <p>{t('transcriptNotice')}</p>
    {messages.map((message, index) => <section key={index}>
      <h3>{message.role}</h3><MarkdownText text={message.text} labels={labels} />
    </section>)}
  </> : <MarkdownText text={text} labels={labels} />
}

function PromotionControls({ document, api, t, busy, act }: {
  readonly document: KnowledgeDocument
  readonly api: KnowledgeApi
  readonly t: Translate
  readonly busy: boolean
  readonly act: (operation: () => Promise<KnowledgeDocument>) => Promise<void>
}) {
  const [destination, setDestination] = useState(document.suggestedDestination ? `${document.suggestedDestination}/${document.title.replace(/[<>:"/\\|?*]/gu, ' ').trim()}.md` : '')
  const [preview, setPreview] = useState<KnowledgePromotionPreview>()
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const version = useRef(0)
  useEffect(() => () => { version.current++ }, [])
  const load = async (): Promise<void> => {
    const current = ++version.current
    setLoading(true); setPreview(undefined); setApproved(false); setError('')
    try {
      const result = await api.preview({ id: document.id, destination })
      if (current === version.current) setPreview(result)
    } catch (cause) { if (current === version.current) setError(String(cause)) }
    finally { if (current === version.current) setLoading(false) }
  }
  return <fieldset disabled={busy}>
    <legend>{t('promotion')}</legend>
    <p>{t('promotionNotice')}</p>
    <label>{t('destination')}<input value={destination} onChange={(event) => {
      version.current++; setLoading(false); setDestination(event.target.value); setPreview(undefined); setApproved(false)
    }} /></label>
    <button type="button" disabled={loading || !destination.trim()} onClick={() => { void load() }}>{t('preview')}</button>
    {error && <p role="alert">{error}</p>}
    {preview && <>
      <h3>{preview.destination}</h3>
      <p>{t('newFileDiff')}</p>
      <pre>{preview.after.split('\n').map(line => `+ ${line}`).join('\n')}</pre>
      <label><input type="checkbox" checked={approved} onChange={(event) => { setApproved(event.target.checked) }} />{t('approvePromotion')}</label>
      <button type="button" disabled={!approved} onClick={() => { void act(() => api.promote({ id: document.id, destination: preview.destination, token: preview.token, approved })) }}>{t('promote')}</button>
    </>}
  </fieldset>
}

/** Opens an unsent draft; the button never writes a knowledge artifact or calls a model. */
export function CaptureButton({ createDraft, t, className }: {
  readonly createDraft: () => Promise<void>
  readonly t: Translate
  readonly className?: string | undefined
}) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const saving = useRef(false)
  const capture = async (): Promise<void> => {
    if (saving.current) return
    saving.current = true
    setPending(true); setError(''); setMessage('')
    try { await createDraft(); setMessage(t('saved')) }
    catch (cause) { setError(String(cause)) }
    finally { saving.current = false; setPending(false) }
  }
  return <div>
    <button
      type="button" className={className} disabled={pending}
      title={t('captureHint')} aria-label={t(pending ? 'saving' : 'capture')}
      onClick={() => { void capture() }}
    >
      {t(pending ? 'saving' : 'capture')}<span>{t('captureHint')}</span>
    </button>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </div>
}
