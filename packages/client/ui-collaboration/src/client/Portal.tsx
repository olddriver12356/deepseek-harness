/** Compact connection list in the existing Live Signal card. */
import type { PortalProps } from './types.ts'
import css from './Collaboration.module.css'

/** @param props - renderer-bound Session, committed view and view actions. @returns the compact peer list. */
export function Portal({ sessionId, useCollaboration, useSessions, useStore, actions, refresh, t }: PortalProps) {
  const data = useCollaboration(value => value)
  const view = data.view
  const sessions = useSessions(value => value)
  const state = useStore(value => value)
  return <section className={css.portal} aria-label={t('title')}>
    <div className={css.header}><strong>{t('title')}</strong><button type="button" onClick={() => { actions.open() }}>{t('add')}</button></div>
    {data.phase === 'loading' && <p role="status">{t('loading')}</p>}
    {data.error !== null && <p role="alert">{typeof data.error === 'string' ? data.error : t(data.error.key)}</p>}
    {data.view?.connections.length === 0 && <p>{t('empty')}</p>}
    {data.view?.connections.map((pair) => {
      const peerId = pair.sessions[0] === sessionId ? pair.sessions[1] : pair.sessions[0]
      const registration = view?.registrations.find(row => row.sessionId === peerId)
      const observation = view?.observations.find(value => value.sessionId === peerId)
      const row = sessions.byId[peerId]
      const availability = row === undefined ? observation?.availability ?? 'unknown' : row.running ? 'running' : 'inactive'
      const incoming = view?.outbox.filter(message => message.connectionId === pair.id && message.recipient === sessionId) ?? []
      const readIndex = incoming.findIndex(message => message.id === state.readThrough[pair.id])
      const unread = incoming.length - readIndex - 1
      return <button className={css.connection} type="button" key={pair.id} onClick={() => { actions.open(pair.id) }}>
        <strong>{registration?.title || row?.displayTitle || peerId}</strong>
        <span>{pair.paused ? t('paused') : t(availability === 'running' ? 'running' : availability === 'inactive' ? 'inactive' : 'unavailable')}</span>
        <small>{(observation === undefined ? row?.cwd : observation.cwd) ?? t('unknown')}</small>
        {unread > 0 && <span>{t('unread')}: {unread}</span>}
      </button>
    })}
    <button type="button" onClick={() => { void refresh() }}>{t('refresh')}</button>
  </section>
}
