/** Configured-handler timing and effects without fabricated execution history. */
import type { ToolReferenceDetail } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { PanelTranslate } from './panel-locales.ts'
import css from './ReferenceCatalog.module.css'

/** @param props - selected handler observation and localized chrome. @returns inert behavior reference. */
export function HookReference({ detail, t }: { detail: Extract<ToolReferenceDetail, { kind: 'hook' }>; t: PanelTranslate }) {
  if ('code' in detail) return <p>{t('referenceUnavailable')}</p>
  return <article className={css.manual}>
    <p>{detail.adapter} · {detail.events.join(', ')}</p>
    {detail.matcher !== undefined && <><h3>{t('referenceMatcher')}</h3><code>{detail.matcher}</code></>}
    <h3>{t('referenceTrigger')}</h3><p>{detail.trigger}</p>
    <h3>{t('referenceEffects')}</h3><ul>{detail.effects.map(text => <li key={text}>{text}</li>)}</ul>
    <h3>{t('referenceLimitations')}</h3><ul>{detail.limitations.map(text => <li key={text}>{text}</li>)}</ul>
    <h3>{t('referenceLastExecution')}</h3><p>{t('referenceUncorrelated')}</p>
  </article>
}
