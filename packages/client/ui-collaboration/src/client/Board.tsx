/** Discussion details and explicit human connection controls. */
import { useEffect, useRef, useState } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { BoardProps } from './types.ts'
import css from './Collaboration.module.css'

function wholeLimit(text: string): number | undefined {
  if (!/^\d+$/u.test(text)) return undefined
  const value = Number(text)
  return Number.isSafeInteger(value) ? value : undefined
}

/** @param props - committed view, local drafts and authorized callbacks. @returns the native modal discussion dialog. */
export function Board({
  sessionId, useCollaboration, useSessions, useStore, actions, addPeer, control, setBudget, openSession, t,
}: BoardProps) {
  const state = useStore(value => value)
  const data = useCollaboration(value => value)
  const sessions = useSessions(value => value)
  const dialog = useRef<HTMLDialogElement>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const view = data.view
  const pair = view?.connections.find(value => value.id === state.selected)
  const latestIncoming = view?.outbox.filter(message => message.connectionId === pair?.id && message.recipient === sessionId).at(-1)?.id
  useEffect(() => {
    if (state.open && pair !== undefined && latestIncoming !== undefined && state.readThrough[pair.id] !== latestIncoming) {
      actions.read(pair.id, latestIncoming)
    }
  }, [state.open, pair?.id, latestIncoming, state.readThrough, actions.read])
  useEffect(() => {
    if (!state.open) return
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { dialog.current?.close(); previous?.focus() }
  }, [state.open])
  if (!state.open) return null
  const draft = state.draft
  const current = sessions.byId[sessionId]
  const peer = sessions.byId[draft.peerId as SessionId]
  const limit = wholeLimit(draft.activationLimit)
  const canConnect = current?.cwd !== undefined && peer?.cwd !== undefined && peer.id !== sessionId && peer.origin !== 'subagent'
    && draft.disclosure && limit !== undefined
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setFailure(null)
    try { await operation() } catch (error) { setFailure(error instanceof Error ? error.message : String(error)) }
    finally { setBusy(false) }
  }
  return <dialog ref={dialog} className={css.dialog} aria-label={t('details')} onCancel={() => { actions.close() }} onClose={() => { actions.close() }}>
    <div className={css.header}><h2>{t('details')}</h2><button type="button" onClick={() => { actions.close() }}>{t('close')}</button></div>
    <p>{t('purpose')}</p>
    {(failure ?? data.error) !== null && <p role="alert">{failure ?? (typeof data.error === 'string' ? data.error : data.error === null ? null : t(data.error.key))}</p>}
    <fieldset disabled={busy}><legend>{t('add')}</legend>
      <label>{t('peer')}<select value={draft.peerId} onChange={(event) => { actions.draft({ peerId: event.target.value }) }}>
        <option value="">{t('choose')}</option>
        {sessions.ids.filter(id => id !== sessionId && sessions.byId[id]?.origin !== 'subagent').map(id => <option value={id} key={id}>{sessions.byId[id]?.displayTitle ?? id}</option>)}
      </select></label>
      <label>{t('ownTitle')}<input value={draft.title} onChange={(event) => { actions.draft({ title: event.target.value }) }} /></label>
      <label>{t('peerTitle')}<input value={draft.peerTitle} onChange={(event) => { actions.draft({ peerTitle: event.target.value }) }} /></label>
      <p>{t('warning')}</p>
      <label><input type="checkbox" checked={draft.disclosure} onChange={(event) => { actions.draft({ disclosure: event.target.checked }) }} />{t('disclosure')}</label>
      <label><input type="checkbox" checked={draft.snapshot} onChange={(event) => { actions.draft({ snapshot: event.target.checked }) }} />{t('snapshotGrant')}</label>
      <label><input type="checkbox" checked={draft.follow} onChange={(event) => { actions.draft({ follow: event.target.checked }) }} />{t('followGrant')}</label>
      <label>{t('activationLimit')}<input inputMode="numeric" value={draft.activationLimit} onChange={(event) => { actions.draft({ activationLimit: event.target.value }) }} /></label>
      <button type="button" disabled={!canConnect} onClick={() => { void run(async () => {
        if (!canConnect || current.cwd === undefined || peer.cwd === undefined) throw new Error(t('invalid'))
        await addPeer({ peerSessionId: peer.id, cwd: current.cwd, peerCwd: peer.cwd, title: draft.title, peerTitle: draft.peerTitle,
          disclosureAccepted: true, grants: { snapshot: draft.snapshot, follow: draft.follow }, activationLimit: limit })
      }) }}>{t('connect')}</button>
    </fieldset>
    <nav aria-label={t('title')}>{view?.connections.map(connection => <button type="button" key={connection.id} onClick={() => { actions.select(connection.id) }} aria-pressed={state.selected === connection.id}>
      {view.registrations.find(row => row.sessionId === connection.sessions.find(id => id !== sessionId))?.title || connection.id}
    </button>)}</nav>
    {pair !== undefined && <section aria-label={t('details')}>
      <p>{pair.paused ? t('paused') : t('connected')}</p>
      <dl><dt>{t('connectionId')}</dt><dd>{pair.id}</dd><dt>{t('charged')}</dt><dd>{pair.budget.used} / {pair.budget.limit}</dd>
        <dt>{t('snapshotGrant')}</dt><dd>{t(pair.grants.snapshot ? 'yes' : 'no')}</dd><dt>{t('followGrant')}</dt><dd>{t(pair.grants.follow ? 'yes' : 'no')}</dd></dl>
      {pair.sessions.map((id) => {
        const observation = view?.observations.find(value => value.sessionId === id)
        const git = observation?.git
        return <section key={id}>
          <h3>{view?.registrations.find(row => row.sessionId === id)?.title || sessions.byId[id]?.displayTitle || id}</h3>
          <dl><dt>{t('workspace')}</dt><dd>{(observation === undefined ? sessions.byId[id]?.cwd : observation.cwd) ?? t('unknown')}</dd>
            <dt>{t('worktree')}</dt><dd>{git?.kind === 'observed' ? git.root : t('unknown')}</dd>
            <dt>{t('branch')}</dt><dd>{git?.kind === 'observed' ? git.branch ?? t('detached') : t('unknown')}</dd></dl>
          <button type="button" onClick={() => { actions.close(); openSession(id) }}>{t('openSession')}</button>
        </section>})}
      <div className={css.controls}>
        <button disabled={busy} type="button" onClick={() => { void run(() => control(pair.paused ? 'resume' : 'pause', pair.id)) }}>{t(pair.paused ? 'resume' : 'pause')}</button>
        <button disabled={busy} type="button" onClick={() => { void run(() => control('removePeer', pair.id)) }}>{t('disconnect')}</button>
        <label>{t('activationLimit')}<input aria-label={t('budget')} inputMode="numeric" value={state.budget} onChange={(event) => { actions.budget(event.target.value) }} /></label>
        <button disabled={busy || wholeLimit(state.budget) === undefined || Number(state.budget) < pair.budget.used} type="button" onClick={() => { void run(() => setBudget(pair.id, Number(state.budget))) }}>{t('budget')}</button>
      </div>
      <h3>{t('activity')}</h3>
      {view?.outbox.filter(message => message.connectionId === pair.id).map(message => <article className={css.message} key={message.id}>
        {message.deliveryReason !== undefined && <p role="alert">{t(message.deliveryReason)}</p>}
        <strong>{t(message.state)}</strong><dl><dt>{t('sender')}</dt><dd>{message.sender}</dd><dt>{t('recipient')}</dt><dd>{message.recipient}</dd><dt>{t('messageId')}</dt><dd>{message.id}</dd></dl>
        <p className={css.body}>{message.text}</p>
      </article>)}
      {view?.outbox.every(message => message.connectionId !== pair.id) && <p>{t('noMessages')}</p>}
    </section>}
  </dialog>
}
