import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { NewsItem, NewsSnapshot } from '@deepseek-ai/dsh-host-news/types'
import css from './NewsPanel.module.css'

/** Client-side reader over the mounted News Remote. */
export type NewsReader = (request: { readonly refresh: boolean }) => Promise<NewsSnapshot>

export interface NewsPanelProps {
  readonly appPanels: IAppPanels
  readonly read: NewsReader
}

type LoadState = 'idle' | 'loading' | 'ready' | 'error'

function formatTime(value: string | null): string {
  if (value === null) return 'TIME UNKNOWN'
  const date = new Date(value)
  return Number.isNaN(date.valueOf()) ? 'TIME UNKNOWN' : date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function NewsCard({ item, kind }: { readonly item: NewsItem; readonly kind: string }): ReactNode {
  const [failed, setFailed] = useState(false)
  const showImage = item.imageUrl !== null && !failed
  return (
    <article className={css.card}>
      <div className={css.cover} data-fallback={!showImage} aria-hidden={showImage}>
        {showImage
          ? <img alt="" onError={() => { setFailed(true) }} src={item.imageUrl} />
          : <><span aria-hidden>{item.source.slice(0, 2).toUpperCase()}</span><span aria-hidden>{kind}</span></>}
      </div>
      <div className={css.copy}>
        <div className={css.meta}>
          <span className={css.source}>{item.source}</span>
          <span className={css.time}>{formatTime(item.publishedAt)}</span>
        </div>
        <h3>{item.title}</h3>
        {item.summary !== '' && <p className={css.summary}>{item.summary}</p>}
        <a className={css.sourceLink} href={item.url} rel="noreferrer" target="_blank">阅读原文 ↗</a>
      </div>
    </article>
  )
}

function NewsColumn({ title, kind, items, state }: {
  readonly title: string
  readonly kind: string
  readonly items: readonly NewsItem[]
  readonly state: LoadState
}): ReactNode {
  return (
    <section className={css.column}>
      <header className={css.columnHeader}><h2>{title}</h2><b>{kind} / {items.length} ITEMS</b></header>
      {state === 'loading' && <p className={css.state}>正在抓取最近三天的更新…</p>}
      {state === 'ready' && items.length === 0 && <p className={css.state}>最近三天没有可展示的内容。</p>}
      {state === 'ready' && items.length > 0 && <div className={css.cards}>{items.map(item => <NewsCard item={item} key={item.url} kind={kind} />)}</div>}
    </section>
  )
}

/** News surface matching the approved two-column editorial mockup. */
export function NewsPanel({ appPanels, read }: NewsPanelProps): ReactNode {
  const active = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [state, setState] = useState<LoadState>('idle')
  const [snapshot, setSnapshot] = useState<NewsSnapshot>({ fetchedAt: null, news: [], tools: [] })
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (refresh: boolean): Promise<void> => {
    setState('loading')
    setError(null)
    try {
      setSnapshot(await read({ refresh }))
      setState('ready')
    } catch {
      setState('error')
      setError('新闻源暂时不可用，请稍后重试。')
    }
  }, [read])
  useEffect(() => {
    if (active === 'news' && state === 'idle') void load(false)
  }, [active, load, state])
  if (active !== 'news') return null
  return (
    <main className={css.panel} data-news-panel data-news-state={state}>
      <header className={css.header}>
        <div className={css.lockup}><span className={css.mark}>06</span><div><strong>News</strong><small>AI 实时动态</small></div></div>
        <span className={css.status}>LIVE FEED · LAST 3 DAYS</span>
      </header>
      <div className={css.viewport}>
        <div className={css.content}>
          <section className={css.hero}>
            <div>
              <p className={css.kicker}>AI FEED / LAST 3 DAYS</p>
              <h1>最近三天，<br /><span>AI 世界发生了什么？</span></h1>
              <p>新闻与工具各取最多 10 条，来自公开 RSS。点击卡片直达原文；刷新只触发 native news service 的新一轮抓取。</p>
            </div>
            <div><button className={css.refresh} disabled={state === 'loading'} onClick={() => { void load(true) }} type="button">{state === 'loading' ? '抓取中…' : '↻ 刷新抓取'}</button><p className={css.fetched}>{snapshot.fetchedAt === null ? '尚未抓取' : `更新于 ${formatTime(snapshot.fetchedAt)}`}</p></div>
          </section>
          {error !== null && <p className={css.error} role="alert">{error}</p>}
          <div className={css.columns}>
            <NewsColumn items={snapshot.news} kind="NEWS" state={state} title="AI 实时新闻" />
            <NewsColumn items={snapshot.tools} kind="TOOLS" state={state} title="工具与模型动态" />
          </div>
        </div>
      </div>
    </main>
  )
}
