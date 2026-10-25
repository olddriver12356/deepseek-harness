/** Resource-backed flat reference list with lazy selected manuals. */
import { useState } from 'react'
import { Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRuntime, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { LocaleSnapshot } from '@deepseek-ai/dsh-client-locale/client'
import type { HookType } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { referenceAddress } from './reference-resources.ts'
import type { PanelTranslate, PanelKey } from './panel-locales.ts'
import { CommandReference } from './CommandReference.tsx'
import { McpReference } from './McpReference.tsx'
import { HookReference } from './HookReference.tsx'
import css from './ReferenceCatalog.module.css'

/** Reference selection supplied by the existing Tools panel. */
export interface ReferenceOwner {
  section: 'commands' | 'mcp' | 'hooks'
  sessionId?: SessionId
  presetId?: string
  generation: number
}
/** Framework inject face; resource access is supplied by the renderer. */
export interface ReferenceInjected { hooks: { referenceLocale: ObservableSnapshot<LocaleSnapshot> } }
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Replace the Tools page's reference area with one read-only catalog. The parent supplies its section,
     * selected Session/preset and refresh generation; the renderer supplies resource access. No entry leaves the area empty.
     */
    'tools.reference': { kind: 'single'; scope: 'root'; owner: ReferenceOwner }
  }
}
type ReferenceProps = Pick<PropsRuntime<'tools.reference'>, keyof ReferenceOwner | 'useResource'>
  & PropsLocale<'skillsPanel'> & InjectFace<ReferenceInjected>
const types: readonly [HookType | 'all', PanelKey][] = [
  ['all', 'hookAll'], ['session', 'hookSession'], ['prompt', 'hookPrompt'], ['tool', 'hookTool'], ['turn-completion', 'hookTurn'], ['subagent', 'hookSubagent'],
]

/** @param props - framework resource access and selected view. @returns list/filter and selected read-only reference. */
export function ReferenceCatalog({
  section, sessionId, presetId, generation, t, useResource, useReferenceLocale,
}: ReferenceProps) {
  const activeLocale = useReferenceLocale(state => state.active)
  const locale: 'zh' | 'en' = activeLocale === 'zh' ? 'zh' : 'en'
  const [query, setQuery] = useState('')
  const [hookType, setHookType] = useState('all')
  const [selected, setSelected] = useState('')
  const target = { locale, generation, ...sessionId === undefined ? {} : { sessionId }, ...presetId === undefined ? {} : { presetId } }
  const resource = useResource<'tool-reference'>(referenceAddress({ ...target, kind: 'catalog' }))
  const catalog = resource.value?.kind === 'catalog' ? resource.value : undefined
  const snapshot = catalog?.snapshot
  const rows = section === 'commands'
    ? (snapshot?.commands ?? []).map(item => ({ id: `command:${item.name}`, name: `/${item.name}`, description: item.description, source: item.definitionId ?? '', command: item.name }))
    : (snapshot?.[section].items ?? []).filter(item => section !== 'hooks' || hookType === 'all' || ('types' in item && item.types.includes(hookType as HookType)))
      .map(item => ({ id: item.id, name: item.name, description: item.description, source: item.moduleName, command: undefined }))
  const visible = rows.filter(item => `${item.name} ${item.description} ${item.source}`.toLowerCase().includes(query.trim().toLowerCase()))
  const item = visible.find(row => row.id === selected) ?? visible[0]
  const selectedAddress = item === undefined ? '' : referenceAddress({ ...target,
    kind: section === 'commands' ? 'command' : 'detail', selected: item.command ?? item.id })
  const selectedResource = useResource<'tool-reference'>(selectedAddress)
  const descriptor = section === 'commands' ? snapshot?.commands.find(command => command.name === item?.command) : undefined
  const preset = catalog?.plugins.agentPresets?.find(group => presetId === undefined ? group.isDefault : group.id === presetId)
  const configured = [...(catalog?.plugins.entries ?? []), ...(preset?.rows ?? [])].filter(entry => section === 'mcp'
    ? /mcp-client(?:$|\/)/.test(entry.moduleName) : section === 'hooks' && /hooks-(?:codex|claude-code)(?:$|\/)/.test(entry.moduleName))
  return <div className={css.catalog}>
    <aside className={css.index}>
      <Input aria-label={t('catalogSearch')} placeholder={t('catalogSearch')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
      {section === 'hooks' && <label>{t('hookType')}<select aria-label={t('hookType')} value={hookType} onChange={(event) => { setHookType(event.target.value) }}>{types.map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>}
      <p>{t('catalogCount', { count: visible.length })}</p>
      <div className={css.list}>{visible.map(row => <button type="button" key={row.id} aria-pressed={item?.id === row.id} onClick={() => { setSelected(row.id) }}><strong>{row.name}</strong><small>{row.description}</small><small>{row.source}</small></button>)}</div>
      {visible.length === 0 && <p role="status">{t('catalogEmpty')}</p>}
      <small>{t('referenceReadOnly')}</small>
    </aside>
    <main className={css.detail}>
      {resource.status === 'failed' && <p role="alert">{t('referenceReadFailed')}</p>}
      {snapshot?.sessionAvailability === 'not-live' && <p>{t('referenceCold')}</p>}
      {snapshot !== undefined && <p className={css.observed}>{t('referenceObserved')}: {new Date(snapshot.observedAt).toLocaleString(locale)} · {sessionId ?? t('catalogHost')}{presetId === undefined ? '' : ` · ${presetId}`}</p>}
      {item === undefined ? <p>{t('catalogSelect')}</p> : <><h2>{item.name}</h2><p>{item.description}</p>{descriptor?.input !== undefined && <code>{`/${descriptor.name} ${descriptor.input.hint}`}</code>}<ReferenceDetail key={selectedAddress} resource={selectedResource} t={t} /></>}
      {configured.length > 0 && <details className={css.configuration}><summary>{t('referenceConfiguration')}</summary>{configured.map((entry, index) => <p key={`${entry.entryId ?? entry.moduleName}:${index}`}><code>{entry.moduleName}</code> · {t(entry.enabled === 'conditional' ? 'catalogConditional' : !entry.enabled ? 'catalogDisabled' : 'catalogConfigured')}</p>)}</details>}
    </main>
  </div>
}
function ReferenceDetail({ resource, t }: {
  resource: import('@deepseek-ai/dsh-client-resources/client').ResourceSnapshot<import('./reference-resources.ts').ReferenceResource>
  t: PanelTranslate
}) {
  if (resource.status === 'failed') return <p role="alert">{t('referenceReadFailed')}</p>
  const value = resource.value
  if (value === undefined) return <div className={css.loading} role="status" aria-label={t('loading')} />
  if (value.kind === 'command') return <CommandReference guide={value.guide} t={t} />
  if (value.kind !== 'detail') return null
  const detail = value.detail
  if (detail === null) return <p>{t('referenceRemoved')}</p>
  if ('code' in detail) return <p>{t('referenceUnavailable')}</p>
  return detail.kind === 'mcp' ? <McpReference detail={detail} t={t} /> : <HookReference detail={detail} t={t} />
}
