export type KnowledgeLayerId = 'intake' | 'ai-processing' | 'knowledge' | 'personal' | 'methods' | 'feedback'
export type KnowledgeArtifactState = 'ACTIVE' | 'READY' | 'REJECTED'

export interface KnowledgeLayer {
  readonly id: KnowledgeLayerId
  readonly ordinal: 1 | 2 | 3 | 4 | 5 | 6
  readonly label: string
}

export interface KnowledgeArtifact {
  readonly id: string
  readonly layerId: KnowledgeLayerId
  readonly state: KnowledgeArtifactState
  readonly title: string
  readonly summary: string
  readonly updatedAt: string
}

export interface KnowledgeSnapshot {
  readonly layers: readonly KnowledgeLayer[]
  readonly artifacts: readonly KnowledgeArtifact[]
  readonly featuredArtifactId: string
}
