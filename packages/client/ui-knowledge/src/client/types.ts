/**
 * Stable identifiers for the six Agent Layer navigation destinations.
 */
export type KnowledgeLayerId = 'intake' | 'ai-processing' | 'knowledge' | 'personal' | 'methods' | 'feedback'
/**
 * Display state of one Agent Layer artifact.
 */
export type KnowledgeArtifactState = 'ACTIVE' | 'READY' | 'REJECTED' | 'PENDING' | 'PROCESSING'

/**
 * Ordered Agent Layer destination with a localized label.
 */
export interface KnowledgeLayer {
  readonly id: KnowledgeLayerId
  readonly ordinal: 1 | 2 | 3 | 4 | 5 | 6
  readonly label: string
}

/**
 * Artifact metadata used by the Knowledge overview.
 */
export interface KnowledgeArtifact {
  readonly id: string
  readonly layerId: KnowledgeLayerId
  readonly state: KnowledgeArtifactState
  readonly title: string
  readonly summary: string
  readonly updatedAt: string
  readonly topics?: readonly string[]
}

/**
 * Overview layers, visible artifacts, and the featured artifact identity.
 */
export interface KnowledgeSnapshot {
  readonly layers: readonly KnowledgeLayer[]
  readonly artifacts: readonly KnowledgeArtifact[]
  readonly featuredArtifactId: string
}
