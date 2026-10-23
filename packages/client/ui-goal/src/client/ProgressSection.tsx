/** Session progress presentation; local state owns only expansion, drafts and request feedback. */
import { useRef, useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProgressChange, ProgressProjectionView, ProgressRef } from '@deepseek-ai/dsh-long-term-progress/types'
import type { GoalActionResult } from './slots.ts'
import css from './ProgressSection.module.css'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'

/** Revision-exact mutation callback; the Host derives authority from the actual invocation. */
export interface ProgressActions {
  readonly onUpdate: (ref: ProgressRef, change: ProgressChange) => Promise<GoalActionResult>
}
type Props = ProgressActions & PropsLocale<'goal'> & {
  readonly projection: ProgressProjectionView | undefined
  readonly readOnly: boolean
}
/** Framework-bound entry; projected business data is never mirrored into React state. */
export function ProgressDock({ useProjection, useSessionStatus, sessionId, useAccess, ...props }:
PropsRuntime<'shell.activity.progress'> & InjectFace<ProgressActions> & PropsLocale<'goal'>) {
  const projection = useProjection('longTermProgress')
  const pending = useSessionStatus(map => map.get(sessionId)?.pendingInteraction)
  const access = useAccess('longTermProgress/update')
  return <ProgressSection {...props} projection={projection} readOnly={pending !== undefined || !access} />
}
/** Compact two-level checklist with distinct approval, release and acceptance decisions. */
export function ProgressSection({ projection, readOnly, onUpdate, t }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const current = projection?.current
  const disabled = pending || readOnly || projection?.status !== 'ready'
  const run = async (change: ProgressChange): Promise<void> => {
    if (busy.current || disabled) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const result = await onUpdate({ revision: current?.revision ?? 0 }, change)
      if (result.ok) setDraft(null)
      else setError(result.error.message)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('progress.error'))
    } finally { busy.current = false; setPending(false) }
  }
  const save = (): void => {
    if (draft === null) return
    try {
      // The Host validates this user-edited wire payload before committing.
      const milestones = JSON.parse(draft) as Extract<ProgressChange, { kind: 'replace' }>['milestones']
      void run({ kind: 'replace', milestones })
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('progress.error')) }
  }
  const currentIndex = current?.milestones.findIndex(m => !current.acceptances.some(a => a.milestoneId === m.id)) ?? -1
  return <section className={css.section} aria-label={t('progress.title')} aria-busy={pending}>
    <header className={css.header}>
      <span className={css.title}>{t('progress.title')}</span>
      <Button variant="ghost" disabled={disabled} onClick={() => {
        setDraft(JSON.stringify(current?.milestones.map(m => ({ ...m,
          checkpoints: m.checkpoints.map(({ id, outcome, detail, references }) => ({ id, outcome, detail, references })),
        })) ?? [], null, 2))
      }}>{t('progress.edit')}</Button>
    </header>
    {projection === undefined && <p>{t('progress.loading')}</p>}
    {projection?.status === 'untrusted' && <p role="alert" className={css.error}>
      {t('progress.untrusted')} {projection.failure.message}
    </p>}
    {projection !== undefined && (current == null || current.milestones.length === 0) && <p>{t('progress.empty')}</p>}
    {draft !== null && <div className={css.editor}>
      <label>{t('progress.draft')}<textarea aria-label={t('progress.draft')} value={draft} disabled={disabled}
        onChange={(event) => { setDraft(event.target.value) }} /></label>
      <p>{t('progress.draftHelp')}</p>
      <div className={css.actions}>
        <Button variant="outline" disabled={disabled || draft.trim() === ''} onClick={save}>{t('progress.save')}</Button>
        <Button variant="ghost" disabled={pending} onClick={() => { setDraft(null); setError('') }}>{t('progress.cancel')}</Button>
      </div>
    </div>}
    <div className={css.list}>
      {current?.milestones.map((milestone, index) => {
        const accepted = current.acceptances.some(a => a.milestoneId === milestone.id)
        const approved = current.approvals.some(a => a.milestoneId === milestone.id)
        const released = current.release?.milestoneId === milestone.id
        const done = milestone.checkpoints.filter(c => c.complete).length
        const complete = done === milestone.checkpoints.length
        const status = accepted ? 'progress.accepted' : index !== currentIndex ? 'progress.blocked'
          : complete ? 'progress.verify' : released ? 'progress.released' : approved ? 'progress.awaitingStart' : 'progress.awaitingApproval'
        const open = expanded === milestone.id
        return <article className={css.milestone} key={milestone.id}>
          <button type="button" className={css.row} aria-expanded={open} onClick={() => { setExpanded(open ? null : milestone.id) }}>
            <span className={css.title}>{milestone.title}</span>
            <span>{t('progress.count', { done, total: milestone.checkpoints.length })}</span>
          </button>
          <p className={css.caption}>{milestone.caption}</p><p className={css.status}>{t(status)}</p>
          {open && <div className={css.details}>
            <p>{milestone.exitCondition}</p>
            <ul>{milestone.checkpoints.map(checkpoint => <li key={checkpoint.id}>
              <span className={css.outcome}><input type="checkbox" checked={checkpoint.complete} readOnly tabIndex={-1}
                aria-label={checkpoint.outcome} />{checkpoint.outcome}</span>
              {checkpoint.detail !== '' && <p>{checkpoint.detail}</p>}
              <details><summary>{t('progress.evidence')}</summary>
                {checkpoint.evidence.length === 0 && <p>{t('progress.none')}</p>}
                {checkpoint.evidence.map(e => <div key={e.revision}><p>{t(e.kind === 'passed' ? 'progress.passed' : 'progress.failed')}: {e.summary}</p>
                  {e.references.map(reference => <p key={reference} className={css.reference}>{reference}</p>)}</div>)}
                {checkpoint.references.map(reference => <p key={reference} className={css.reference}>{reference}</p>)}
              </details>
            </li>)}</ul>
            {milestone.references.map(reference => <p key={reference} className={css.reference}>{reference}</p>)}
            {index === currentIndex && !accepted && <div className={css.actions}>
              {!approved && <Button variant="outline" disabled={disabled} onClick={() => { void run({ kind: 'approve', milestoneId: milestone.id }) }}>
                {t('progress.approve')}</Button>}
              {approved && !complete && <Button variant="outline" disabled={disabled}
                onClick={() => { void run({ kind: 'start', milestoneId: milestone.id }) }}>{t(released ? 'progress.renew' : index === 0 ? 'progress.start' : 'progress.release')}</Button>}
              {complete && <Button variant="outline" disabled={disabled}
                onClick={() => { void run({ kind: 'accept', milestoneId: milestone.id }) }}>{t('progress.accept')}</Button>}
            </div>}
          </div>}
        </article>
      })}
    </div>
    {current?.vault != null && <div className={css.vault}>
      <span>{t(current.vault.writeback === 'suspended' ? 'progress.vault.suspended' : `progress.vault.${current.vault.settlement}`)}</span>
      <p className={css.reference}>{current.vault.path}</p><p>{current.vault.message}</p>
    </div>}
    {error !== '' && <p role="alert" className={css.error}>{error}</p>}
  </section>
}
