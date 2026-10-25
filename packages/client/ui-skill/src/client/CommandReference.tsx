/** Readable human-only command manual; copy never submits an invocation. */
import { useState } from 'react'
import { Button, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CommandUsageArgument, CommandUsageGuide } from '@deepseek-ai/dsh-commands/types'
import type { PanelTranslate } from './panel-locales.ts'
import css from './ReferenceCatalog.module.css'

function Arguments({ items, t }: { items: readonly CommandUsageArgument[]; t: PanelTranslate }) {
  return <dl>{items.map(item => <div key={item.name}><dt><code>{item.name}</code> · {t(item.required ? 'referenceRequired' : 'referenceOptional')}</dt><dd>{item.description}{item.defaultValue !== undefined && <p>{t('referenceDefault')}: {item.defaultValue}</p>}{item.acceptedValues !== undefined && <p>{t('referenceAccepted')}: {item.acceptedValues.join(', ')}</p>}</dd></div>)}</dl>
}
/** @param props - selected source guide and localized chrome. @returns inert manual and explicit clipboard actions. */
export function CommandReference({ guide, t }: { guide: CommandUsageGuide | null; t: PanelTranslate }) {
  const [copied, setCopied] = useState('')
  const [failed, setFailed] = useState(false)
  const copy = async (text: string): Promise<void> => {
    const accepted = await writeClipboard(text)
    setFailed(!accepted)
    setCopied(accepted ? text : '')
  }
  if (guide === null) return <p>{t('referenceNoGuide')}</p>
  return <article className={css.manual}>
    <h3>{t('referencePurpose')}</h3><p>{guide.purpose}</p>
    <h3>{t('referenceWhen')}</h3><p>{guide.when}</p>
    <h3>{t('referenceSyntax')}</h3><div className={css.codeRow}><code>{guide.syntax}</code><Button variant="ghost" onClick={() => { void copy(guide.syntax) }}>{t(copied === guide.syntax ? 'referenceCopied' : 'referenceCopy')}</Button></div>
    {failed && <p role="alert">{t('referenceCopyFailed')}</p>}
    <h3>{t('referenceArguments')}</h3>{guide.arguments.kind === 'none' ? <p>{t('referenceNoArguments')}</p> : <Arguments items={guide.arguments.items} t={t} />}
    {guide.subcommands.length > 0 && <><h3>{t('referenceSubcommands')}</h3>{guide.subcommands.map(item => <section key={item.name}><h4>{item.name}</h4><code>{item.syntax}</code><p>{item.description}</p><Arguments items={item.arguments} t={t} /></section>)}</>}
    <h3>{t('referenceExamples')}</h3>{guide.examples.map(item => <section key={item.input}><h4>{item.title}</h4><div className={css.codeRow}><code>{item.input}</code><Button variant="ghost" onClick={() => { void copy(item.input) }}>{t(copied === item.input ? 'referenceCopied' : 'referenceCopy')}</Button></div><p>{item.expectedResult}</p></section>)}
    <h3>{t('referenceEffects')}</h3><ul>{guide.effects.map(text => <li key={text}>{text}</li>)}</ul>
    <h3>{t('referenceLimitations')}</h3><ul>{guide.limitations.map(text => <li key={text}>{text}</li>)}</ul>
  </article>
}
