/**
 * Session-scoped Expert multi-select, seated inside the Live Signal card
 * (`shell.activity.selectors`). A searchable dropdown over the approved
 * CONVERSATIONAL roster — delegated Experts run as forked children with their
 * own task and returned result, which this prefix surface cannot express, so
 * they are dispatched from the Experts panel instead. Local render state
 * tracks the checked ids, and every change
 * recomposes the full text and pushes it to `ctx.conversation.prefixes`
 * under the `'experts'` source, so it rides along on the Session's next
 * ordinary send without the composer importing this package.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ExpertRecord } from './types.ts'
import css from './ExpertSelect.module.css'

export interface ExpertSelectInjected {
  /** Approved Experts available to select (host is the source of truth). */
  listExperts: () => Promise<readonly ExpertRecord[]>
  /** Pushes the current selection's composed text, or clears it when empty. */
  setSelection: (experts: readonly ExpertRecord[]) => void
}

export type ExpertSelectProps =
  PropsRuntime<'shell.activity.selectors'>
  & InjectFace<ExpertSelectInjected>
  & PropsLocale<'experts'>

export function ExpertSelect({ listExperts, setSelection, t }: ExpertSelectProps) {
  const [experts, setExperts] = useState<readonly ExpertRecord[]>([])
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    listExperts().then((loaded) => {
      // Conversational only: this surface composes prefix text for the next
      // ordinary send, which applies none of a delegated Expert's persona,
      // route, or tool scoping. Offering one here would inject its instructions
      // while silently skipping the fork that gives it its authority.
      if (!cancelled) {
        setExperts(loaded.filter(expert => expert.status === 'approved' && expert.execution === 'conversational'))
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [listExperts])

  useEffect(() => {
    if (!open) return
    searchRef.current?.focus()
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return needle === '' ? experts : experts.filter(expert => expert.name.toLowerCase().includes(needle))
  }, [experts, query])

  const selected = useMemo(() => experts.filter(expert => selectedIds.has(expert.id)), [experts, selectedIds])

  const toggle = (id: string): void => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
    setSelection(experts.filter(expert => next.has(expert.id)))
  }

  const triggerLabel = selected.length === 0 ? t('selectorPlaceholder') : t('selectorCount', { count: String(selected.length) })

  return (
    <section className={css.section} aria-labelledby="selector-experts" ref={rootRef}>
      <div className={css.sectionHeader}><span id="selector-experts">{t('selectorTitle')}</span></div>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={css.trigger}
        onClick={() => { setOpen(!open) }}
        type="button"
      >
        <span className={css.triggerLabel}>{triggerLabel}</span>
        <span className={css.chevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={css.menu} role="listbox" aria-multiselectable="true">
          <div className={css.searchRow}>
            <span className={css.searchIcon}>⌕</span>
            <input
              className={css.searchInput}
              onChange={(event) => { setQuery(event.target.value) }}
              placeholder={t('selectorSearchPlaceholder')}
              ref={searchRef}
              type="text"
              value={query}
            />
          </div>
          <div className={css.options}>
            {filtered.length === 0
              ? <p className={css.muted}>{t('selectorEmpty')}</p>
              : filtered.map(expert => (
                <button
                  aria-selected={selectedIds.has(expert.id)}
                  className={css.option}
                  data-active={selectedIds.has(expert.id) || undefined}
                  key={expert.id}
                  onClick={() => { toggle(expert.id) }}
                  role="option"
                  type="button"
                >
                  <span className={css.check}>{selectedIds.has(expert.id) ? '✓' : ''}</span>
                  <span>{expert.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}
