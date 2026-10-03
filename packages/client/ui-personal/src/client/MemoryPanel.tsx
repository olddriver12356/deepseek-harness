import { useEffect, useState } from 'react'
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { memoryZh } from './memory-locales.ts'
import css from './MemoryPanel.module.css'

type Tier = 'working' | 'episodic' | 'semantic' | 'handoff' | 'flags'
interface MemoryFile { path: string; title: string; tier: Tier; modified: string }
interface MemoryDocument { path: string; content: string; modified: string }
export interface MemoryApi { list: () => Promise<MemoryFile[]>; read: (path: string) => Promise<MemoryDocument> }
export const memoryApi: MemoryApi = {
  list: () => fetchMemory(''), read: path => fetchMemory('?path=' + encodeURIComponent(path)),
}
async function fetchMemory<T>(query: string): Promise<T> {
  const response = await fetch('/personal/api/memory' + query, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) throw new Error('Memory request failed')
  return response.json() as Promise<T>
}

/** Owner-only file viewer; request cleanup prevents an earlier document replacing a newer selection. */
export function MemoryPanel({ t, api = memoryApi }: { t: (key: keyof typeof memoryZh) => string; api?: MemoryApi }) {
  const [files, setFiles] = useState<MemoryFile[]>([])
  const [tier, setTier] = useState<Tier>('working')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('Working Memory.md')
  const [document, setDocument] = useState<MemoryDocument>()
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState(false)
  const [readError, setReadError] = useState(false)
  const [raw, setRaw] = useState(false)
  useEffect(() => {
    let current = true
    setLoading(true); setError(false)
    void api.list().then((value) => { if (current) setFiles(value) }, () => { if (current) { setError(true); setFiles([]) } })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, revision])
  const available = files.filter(file => file.tier === tier).sort((a, b) => tier === 'semantic'
    ? a.path.localeCompare(b.path)
    : tier === 'handoff' ? b.modified.localeCompare(a.modified)
      : Number(/^\d{4}-\d{2}-\d{2}/u.test(b.title)) - Number(/^\d{4}-\d{2}-\d{2}/u.test(a.title)) || b.title.localeCompare(a.title))
  const visible = available.filter(file => (file.title + ' ' + file.path).toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
  const groups = Map.groupBy(visible, file => tier === 'semantic' ? file.path.split('/').slice(1, -1).join('/') || t('memoryGeneral')
    : tier === 'episodic' ? file.title.match(/^\d{4}-\d{2}(?=-)/u)?.[0] ?? t('memoryIndexes') : t(tier))
  const path = visible.find(file => file.path === selected)?.path ?? visible[0]?.path
  const sourcePath = document === undefined ? '' : `Memory/${document.path}`
  const markdown = document?.content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '') ?? ''
  const todayStart = document?.path === 'Working Memory.md' ? markdown.search(/^## Today[^\n]*/m) : -1
  const readingText = todayStart < 0 ? markdown : markdown.slice(todayStart)
  useEffect(() => {
    let current = true
    setDocument(undefined); setReadError(false)
    if (path === undefined) { setReading(false); return }
    setReading(true)
    void api.read(path).then((value) => { if (current) setDocument(value) }, () => { if (current) setReadError(true) })
      .finally(() => { if (current) setReading(false) })
    return () => { current = false }
  }, [api, path, revision])
  return <div className={css.memory}>
    <header className={css.hero}><p>{t('memoryReadOnly')}</p><h1>{t('memoryHeading')}</h1><h2>{t('memorySubtitle')}</h2><p>{t('memoryIntro')}</p></header>
    <div className={css.toolbar}>
      <nav aria-label={t('memory')} className={css.tiers}>{(['working', 'episodic', 'semantic', 'handoff', 'flags'] as const).map(item =>
        <button key={item} type="button" aria-label={t(item)} aria-pressed={tier === item} onClick={() => { setTier(item); setQuery('') }}>
          <span>{t(item)}</span><small title={t('memoryFileCount')}>{files.filter(file => file.tier === item).length}</small>
        </button>)}</nav>
      <div className={css.search}><input type="search" aria-label={t('memorySearch')} placeholder={t('memorySearch')} value={query} onChange={(event) =>{  setQuery(event.target.value) }} />
        <button type="button" aria-label={t('memoryRefresh')} title={t('memoryRefresh')} onClick={() =>{  setRevision(value => value + 1) }}>↻</button></div>
    </div>
    <div className={css.workspace}>
      <aside className={css.directory} aria-label={t('memoryFileCount')}>
        {loading ? <p role="status">{t('memoryLoading')}</p> : error ? <p role="alert">{t('memoryError')}</p> : !visible.length ? <p>{t('memoryEmpty')}</p> :
          [...groups].map(([group, entries]) => <section key={group} className={css.group}><h3>{group}</h3><ul className={css.files}>{entries.map(file => <li key={file.path}><button type="button" aria-current={path === file.path ? 'page' : undefined} onClick={() =>{  setSelected(file.path) }}>
            <span className={css.frame} aria-hidden="true" style={{ backgroundPosition: `${(Array.from(file.path).reduce((hash, char) => hash + char.charCodeAt(0), 0) % 3) * 50}% center` }}><span>{String(available.indexOf(file) + 1).padStart(2, '0')}</span></span>
            <span className={css.fileInfo}><strong>{file.title}</strong><small>{file.path}</small><small>{t('memoryUpdated')}: {new Date(file.modified).toLocaleDateString()}</small></span>
          </button></li>)}</ul></section>)}
      </aside>
      <article className={css.reader} aria-busy={reading}>
        {reading ? <p role="status">{t('memoryLoading')}</p> : readError ? <p role="alert">{t('memoryError')}</p> : document ? <>
          <div className={css.source}><span>{t('memorySource')}: {sourcePath}<br />{t('memoryUpdated')}: {new Date(document.modified).toLocaleString()}</span>
            <button type="button" aria-pressed={raw} onClick={() =>{  setRaw(value => !value) }}>{t(raw ? 'memoryRendered' : 'memoryRaw')}</button></div>
          {todayStart >= 0 && !raw && <p>{t('memoryTodayOnly')}</p>}
          {raw ? <pre>{document.content}</pre> : <MarkdownText text={readingText}
            labels={{ code: { copyLabel: t('memoryCopy'), copiedLabel: t('memoryCopied') }, footnotes: t('memoryFootnotes') }} />}
        </> : <p>{t('memorySelect')}</p>}
      </article>
    </div>
  </div>
}
