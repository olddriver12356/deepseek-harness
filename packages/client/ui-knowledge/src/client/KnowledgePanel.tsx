import { useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from 'react'
import { useEntranceMotion } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IAppPanels } from '@deepseek-ai/dsh-client-ui-shell/client'
import type { KnowledgeArtifact, KnowledgeLayer, KnowledgeLayerId, KnowledgeSnapshot } from './types.ts'
import css from './KnowledgePanel.module.css'
import { zh, type KnowledgeLocaleKey } from './locales.ts'

type Translate = (key: KnowledgeLocaleKey) => string

export interface KnowledgePanelProps {
  readonly appPanels: IAppPanels
  readonly snapshot: KnowledgeSnapshot
  readonly onOpen?: (id: string) => void
  readonly children?: ReactNode
  readonly t?: Translate
}

type ActiveLayer = 'all' | KnowledgeLayerId
type ActiveKind = 'all' | 'news' | 'other'

const NEWS_TOPIC = 'news-article'
const KIND_OPTIONS: readonly { readonly id: ActiveKind; readonly labelKey: KnowledgeLocaleKey }[] = [
  { id: 'all', labelKey: 'kindAll' },
  { id: 'news', labelKey: 'kindNews' },
  { id: 'other', labelKey: 'kindOther' },
]

function isNewsArtifact(artifact: KnowledgeArtifact): boolean {
  return (artifact.topics ?? []).includes(NEWS_TOPIC)
}

function visibleArtifacts(
  snapshot: KnowledgeSnapshot, activeLayer: ActiveLayer, activeKind: ActiveKind, query: string,
): readonly KnowledgeArtifact[] {
  const needle = query.trim().toLowerCase()
  const labels = new Map(snapshot.layers.map(layer => [layer.id, layer.label.toLowerCase()]))
  return snapshot.artifacts.filter((artifact) => {
    if (activeLayer !== 'all' && artifact.layerId !== activeLayer) return false
    if (activeKind !== 'all' && isNewsArtifact(artifact) !== (activeKind === 'news')) return false
    if (needle === '') return true
    return [artifact.title, artifact.summary, artifact.state, labels.get(artifact.layerId) ?? '']
      .some(value => value.toLowerCase().includes(needle))
  })
}

const SUMMARY_LAYERS = [
  { id: 'intake', label: 'INTAKE LAYER', description: '待处理 artifacts' },
  { id: 'knowledge', label: 'KNOWLEDGE LAYER', description: 'active artifacts' },
  { id: 'ai-processing', label: '', description: '' },
] as const satisfies readonly {
  readonly id: KnowledgeLayerId
  readonly label: string
  readonly description: string
}[]

function KnowledgeHeader({ t }: { readonly t: Translate }): ReactNode {
  return (
    <header className={css.header}>
      <div className={css.titleLockup}>
        <span className={css.titleMark}>02</span>
        <div><strong>{t('panelTitle')}</strong><small>第二大脑</small></div>
      </div>
      <span className={css.readOnly}>{t('workflowBoundary')}</span>
    </header>
  )
}

function KnowledgeHero({ snapshot, t }: { readonly snapshot: KnowledgeSnapshot; readonly t: Translate }): ReactNode {
  const activeCount = snapshot.artifacts.filter(artifact => artifact.state === 'ACTIVE').length
  return (
    <section className={css.hero}>
      <div className={css.heroCopy}>
        <p className={css.kicker}>LOCAL AGENT LAYERS / ONE SOURCE</p>
        <h1>你的第二大脑，<span>正在形成。</span></h1>
        <p>{t('boundary')}</p>
      </div>
      <div className={css.metrics} aria-label="Knowledge metrics">
        <span><b>{String(snapshot.artifacts.length).padStart(2, '0')}</b> ARTIFACTS</span>
        <span><b>{String(snapshot.layers.length).padStart(2, '0')}</b> LAYERS</span>
        <span><b>{String(activeCount).padStart(2, '0')}</b> ACTIVE</span>
      </div>
    </section>
  )
}

interface KnowledgeControlsProps {
  readonly snapshot: KnowledgeSnapshot
  readonly query: string
  readonly activeLayer: ActiveLayer
  readonly activeKind: ActiveKind
  readonly onQueryChange: (query: string) => void
  readonly onLayerChange: (layer: ActiveLayer) => void
  readonly onKindChange: (kind: ActiveKind) => void
  readonly t: Translate
}

function KnowledgeControls({
  snapshot,
  query,
  activeLayer,
  activeKind,
  onQueryChange,
  onLayerChange,
  onKindChange,
  t,
}: KnowledgeControlsProps): ReactNode {
  return (
    <>
      <label className={css.search}>
        <span>搜索</span>
        <input
          type="search"
          value={query}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { onQueryChange(event.currentTarget.value) }}
          placeholder="搜索标题、类型或摘要…"
        />
      </label>
      <div className={css.filters} role="group" aria-label="Layers">
        <button type="button" aria-pressed={activeLayer === 'all'} onClick={() => { onLayerChange('all') }}>全部</button>
        {snapshot.layers.map(layer => (
          <button key={layer.id} type="button" aria-pressed={activeLayer === layer.id} onClick={() => { onLayerChange(layer.id) }}>
            {layer.ordinal} {layer.label}
          </button>
        ))}
      </div>
      <div className={css.filters} role="group" aria-label="Kind">
        {KIND_OPTIONS.map(option => (
          <button key={option.id} type="button" aria-pressed={activeKind === option.id} onClick={() => { onKindChange(option.id) }}>
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </>
  )
}

function FocusArtifact({ artifact, layer, onOpen }: {
  readonly artifact: KnowledgeArtifact | undefined
  readonly layer: KnowledgeLayer | undefined
  readonly onOpen: ((id: string) => void) | undefined
}): ReactNode {
  if (artifact === undefined) return <p className={css.emptyFocus}>当前筛选没有可聚焦的 artifact。</p>
  return (
    <article className={css.focusCard}>
      <small>{layer?.ordinal} {layer?.label.toUpperCase()} / {artifact.state}</small>
      <h3>{artifact.title}</h3>
      <p>{artifact.summary}</p>
      <button type="button" disabled={onOpen === undefined} aria-disabled={onOpen === undefined} onClick={() => { onOpen?.(artifact.id) }}>打开 ARTIFACT →</button>
    </article>
  )
}

function LayerSummary({ snapshot, activeLayer, onLayerChange, t }: {
  readonly snapshot: KnowledgeSnapshot
  readonly activeLayer: ActiveLayer
  readonly onLayerChange: (layer: ActiveLayer) => void
  readonly t: Translate
}): ReactNode {
  const layerById = new Map(snapshot.layers.map(layer => [layer.id, layer]))
  const countFor = (layerId: KnowledgeLayerId): number => snapshot.artifacts.filter(artifact => artifact.layerId === layerId).length
  return (
    <div className={css.layerList}>
      {SUMMARY_LAYERS.map(summary => (
        <button key={summary.id} type="button" className={css.layerCard} aria-pressed={activeLayer === summary.id} onClick={() => { onLayerChange(summary.id) }}>
          <span>{layerById.get(summary.id)?.ordinal.toString().padStart(2, '0')}</span>
          <span>
            <strong>{summary.id === 'ai-processing' ? t('processingSummary') : summary.label}</strong>
            <small>{summary.id === 'ai-processing' ? t('processingDescription') : summary.description}</small>
          </span>
          <b>{String(countFor(summary.id)).padStart(2, '0')}</b>
        </button>
      ))}
    </div>
  )
}

function ArtifactCard({ artifact, layer, selected, onSelect, onOpen }: {
  readonly artifact: KnowledgeArtifact
  readonly layer: KnowledgeLayer | undefined
  readonly selected: boolean
  readonly onSelect: (artifactId: string) => void
  readonly onOpen: ((artifactId: string) => void) | undefined
}): ReactNode {
  return (
    <button data-entrance-card type="button" className={css.artifact} aria-pressed={selected} onClick={() => { onSelect(artifact.id); onOpen?.(artifact.id) }}>
      <span className={css.artifactTop}><b>{layer?.ordinal.toString().padStart(2, '0')}</b><small>{artifact.state}</small></span>
      <strong>{artifact.title}</strong>
      <span>{artifact.summary}</span>
      <span className={css.artifactFooter}>
        <b>{layer?.label.toUpperCase()} LAYER</b><time dateTime={artifact.updatedAt}>{artifact.updatedAt}</time>
      </span>
    </button>
  )
}

function ArtifactGrid({ artifacts, selectedArtifactId, layers, onSelect, onOpen }: {
  readonly artifacts: readonly KnowledgeArtifact[]
  readonly selectedArtifactId: string | undefined
  readonly layers: readonly KnowledgeLayer[]
  readonly onSelect: (artifactId: string) => void
  readonly onOpen: ((artifactId: string) => void) | undefined
}): ReactNode {
  const layerById = new Map(layers.map(layer => [layer.id, layer]))
  return (
    <div className={css.artifactGrid}>
      {artifacts.map(artifact => (
        <ArtifactCard
          key={artifact.id}
          artifact={artifact}
          layer={layerById.get(artifact.layerId)}
          selected={selectedArtifactId === artifact.id}
          onSelect={onSelect}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

/** Persistent upstream artifact view. Data and mutations belong to its Remote adapter. */
export function KnowledgePanel({
  appPanels, snapshot, onOpen, children, t = key => zh[key],
}: KnowledgePanelProps): ReactNode {
  const activePanel = useSyncExternalStore(appPanels.subscribe, appPanels.getSnapshot)
  const [query, setQuery] = useState('')
  const [activeLayer, setActiveLayer] = useState<ActiveLayer>('all')
  const [activeKind, setActiveKind] = useState<ActiveKind>('all')
  const entranceRef = useEntranceMotion<HTMLElement>(activePanel === 'knowledge')
  const cardsRef = useEntranceMotion<HTMLElement>(activePanel === 'knowledge', `${activeLayer}:${activeKind}`, 'cards')
  const [selectedArtifactId, setSelectedArtifactId] = useState(snapshot.featuredArtifactId)
  const visible = visibleArtifacts(snapshot, activeLayer, activeKind, query)
  const layerById = new Map(snapshot.layers.map(layer => [layer.id, layer]))
  const selected = visible.find(artifact => artifact.id === selectedArtifactId) ?? visible[0]

  return (
    <section className={css.panel} data-knowledge-panel hidden={activePanel !== 'knowledge'} aria-label="知识库 / 第二大脑">
      <KnowledgeHeader t={t} />
      <div className={css.viewport}>
        <main ref={entranceRef} className={css.content}>
          {children}

          <KnowledgeHero snapshot={snapshot} t={t} />
          <KnowledgeControls
            snapshot={snapshot}
            query={query}
            activeLayer={activeLayer}
            activeKind={activeKind}
            onQueryChange={setQuery}
            onLayerChange={setActiveLayer}
            onKindChange={setActiveKind}
            t={t}
          />
          <div className={css.topGrid}>
            <section aria-labelledby="knowledge-focus-heading">
              <header className={css.sectionHead}><h2 id="knowledge-focus-heading">当前知识</h2><span>FOCUS ARTIFACT</span></header>
              <FocusArtifact
                artifact={selected}
                layer={selected === undefined ? undefined : layerById.get(selected.layerId)}
                onOpen={onOpen}
              />
            </section>
            <aside aria-labelledby="knowledge-layer-heading">
              <header className={css.sectionHead}><h2 id="knowledge-layer-heading">层级状态</h2><span>{t('layerOverview')}</span></header>
              <LayerSummary snapshot={snapshot} activeLayer={activeLayer} onLayerChange={setActiveLayer} t={t} />
            </aside>
          </div>
          <section ref={cardsRef} className={css.library} aria-labelledby="knowledge-library-heading">
            <header className={css.sectionHead}><h2 id="knowledge-library-heading">Agent artifacts</h2><span>{String(visible.length).padStart(2, '0')} RESULTS</span></header>
            {visible.length === 0
              ? <p className={css.emptyResults}>这个 Layer 还没有 artifact。</p>
              : (
                <ArtifactGrid
                  artifacts={visible}
                  selectedArtifactId={selected?.id}
                  layers={snapshot.layers}
                  onSelect={setSelectedArtifactId}
                  onOpen={onOpen}
                />
              )}
          </section>

        </main>
      </div>
    </section>
  )
}
