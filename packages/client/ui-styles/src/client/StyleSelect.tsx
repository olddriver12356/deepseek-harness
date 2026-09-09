/**
 * Session-scoped Style single-select, seated inside the Live Signal card
 * (`shell.activity.selectors`). A searchable dropdown over the approved
 * roster: selecting an option closes the menu and recomposes its text into
 * `ctx.conversation.prefixes` under the `'styles'` source, so it rides along
 * on the Session's next ordinary send without the composer importing this
 * package. Only one Style is active at a time.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { StyleRecord } from './types.ts'
import css from './StyleSelect.module.css'

export interface StyleSelectInjected {
  /** Approved Styles available to select (host is the source of truth). */
  listStyles: () => Promise<readonly StyleRecord[]>
  /** Pushes the selected Style's composed text, or clears it when undefined. */
  setSelection: (style: StyleRecord | undefined) => void
}

export type StyleSelectProps =
  PropsRuntime<'shell.activity.selectors'>
  & InjectFace<StyleSelectInjected>
  & PropsLocale<'styles'>

export function StyleSelect({ listStyles, setSelection, t }: StyleSelectProps) {
  const [styles, setStyles] = useState<readonly StyleRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    listStyles().then((loaded) => {
      if (!cancelled) setStyles(loaded.filter(style => style.status === 'approved'))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [listStyles])

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
    return needle === '' ? styles : styles.filter(style => style.name.toLowerCase().includes(needle))
  }, [styles, query])

  const current = styles.find(style => style.id === selectedId)

  const choose = (style: StyleRecord | undefined): void => {
    setSelectedId(style?.id)
    setSelection(style)
    setOpen(false)
    setQuery('')
  }

  return (
    <section className={css.section} aria-labelledby="selector-styles" ref={rootRef}>
      <div className={css.sectionHeader}><span id="selector-styles">{t('selectorTitle')}</span></div>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className={css.trigger}
        onClick={() => { setOpen(!open) }}
        type="button"
      >
        <span className={css.triggerLabel}>{current?.name ?? t('selectorPlaceholder')}</span>
        <span className={css.chevron}>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className={css.menu} role="listbox">
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
            <button
              aria-selected={selectedId === undefined}
              className={css.option}
              data-active={selectedId === undefined || undefined}
              onClick={() => { choose(undefined) }}
              role="option"
              type="button"
            >
              <span className={css.check}>{selectedId === undefined ? '✓' : ''}</span>
              <span>{t('selectorNone')}</span>
            </button>
            {filtered.length === 0
              ? <p className={css.muted}>{t('selectorEmpty')}</p>
              : filtered.map(style => (
                <button
                  aria-selected={selectedId === style.id}
                  className={css.option}
                  data-active={selectedId === style.id || undefined}
                  key={style.id}
                  onClick={() => { choose(style) }}
                  role="option"
                  type="button"
                >
                  <span className={css.check}>{selectedId === style.id ? '✓' : ''}</span>
                  <span>{style.name}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </section>
  )
}
