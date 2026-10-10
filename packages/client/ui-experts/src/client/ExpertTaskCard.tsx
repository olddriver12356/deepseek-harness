import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import css from './ExpertTaskCard.module.css'

export interface ExpertTaskActions {
  openTask: (address: SubagentAddress) => void
  stopTask: (address: SubagentAddress) => Promise<void>
}
type Props = ToolCallViewProps & PropsLocale<'experts'> & ExpertTaskActions

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Card reads the durable admission receipt; it never treats tool completion as expert completion. */
export function ExpertTaskCard({ block, openTask, stopTask, t, useSessions }: Props) {
  const [error, setError] = useState('')
  const [stopping, setStopping] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [now, setNow] = useState(Date.now)
  const settled = 'kind' in block
  const receipt = settled ? record(record(block.meta)?.expertDelegation) : undefined
  const address: SubagentAddress | undefined = typeof receipt?.childId === 'string' && typeof receipt.parentSessionId === 'string'
    ? { childSessionId: receipt.childId as SessionId, parentSessionId: receipt.parentSessionId as SessionId, mode: 'continuable' } : undefined
  const active = useSessions((state) => {
    if (address === undefined) return undefined
    return state.byId[address.childSessionId]?.running
  })
  const summary = useSessions(state => address === undefined ? undefined : state.byId[address.childSessionId])
  const model = summary?.projectionValues?.modelSelection?.lastUsed
  const timing = summary?.projectionValues?.subagentTiming
  const elapsed = timing === undefined ? undefined : timing.settledMs + (timing.active === undefined ? 0
    : Math.max(0, (active ? now : timing.active.through) - timing.active.since))
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { clearInterval(timer) }
  }, [active])
  let args: Record<string, unknown> | undefined
  try { args = record(JSON.parse((settled ? block.call?.argsRaw : block.argsRaw) ?? '{}')) }
  catch { /* Partial streamed arguments are displayed once complete. */ }
  const title = typeof receipt?.expert === 'string' ? receipt.expert : typeof args?.expert === 'string' ? args.expert : t('title')
  const output = settled ? block.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : ''
  async function stop() {
    if (address === undefined) return
    setStopping(true)
    setError('')
    try { await stopTask(address); setStopped(true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setStopping(false) }
  }
  return <section className={css.card} aria-label={title}>
    <header><strong>{title}</strong><span>{!settled ? t('taskStarting') : block.isError ? t('taskFailed') : active ? t('taskRunning') : t('taskStarted')}</span></header>
    {typeof args?.task === 'string' && <p>{args.task}</p>}
    {receipt !== undefined && <p>{t(receipt.access === 'write' ? 'writeAccess' : 'readOnly')} · {t(receipt.contextMode === 'fork' ? 'forkContext' : 'freshContext')}</p>}
    {model != null && <p>{t('model')}: {model.provider} / {model.model}</p>}
    {elapsed !== undefined && <p>{t('taskDuration', { seconds: Math.floor(elapsed / 1000) })}</p>}
    {address !== undefined && <div className={css.actions}>
      <button type="button" onClick={() => { openTask(address) }}>{t('taskOpen')}</button>
      <button type="button" disabled={stopping} onClick={() => { void stop() }}>{t('taskStop')}</button>
    </div>}
    {stopped && <p role="status">{t('taskStopped')}</p>}
    {error !== '' && <p role="alert">{error}</p>}
    {settled && (block.isError || address === undefined) && <pre>{output}</pre>}
  </section>
}
