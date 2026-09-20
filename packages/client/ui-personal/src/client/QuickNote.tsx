import { useEffect, useRef, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PersonalPanel.module.css'

/** Original Bok capture window embedded in a native modal above the current page. */
export function QuickNote({ t }: PropsLocale<'personal'>) {
  const dialog = useRef<HTMLDialogElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [visited, setVisited] = useState(false)
  useEffect(() => {
    const close = (event: MessageEvent) => {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'dsh-quick-note-close') dialog.current?.close()
    }
    window.addEventListener('message', close)
    return () => window.removeEventListener('message', close)
  }, [])
  return <>
    <button type="button" className={css.quickButton} onClick={() => { setVisited(true); dialog.current?.showModal() }}>{t('quickNote')}</button>
    <dialog ref={dialog} className={css.quickDialog} aria-label={t('quickNote')}>
      <button type="button" className={css.quickClose} aria-label={t('close')} onClick={() => dialog.current?.close()}>×</button>
      {visited && <iframe ref={frame} className={css.frame} src="/personal/quick-note.html" title={t('quickNote')} />}
    </dialog>
  </>
}
