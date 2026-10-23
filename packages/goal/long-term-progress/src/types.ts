/** Session-owned two-level progress contracts. @module @deepseek-ai/dsh-long-term-progress/types */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { GoalRef } from '@deepseek-ai/dsh-goal/types'
/** Stable milestone identity. */
export type MilestoneId = Branded<'MilestoneId'>
/** Stable checkpoint identity. */
export type CheckpointId = Branded<'CheckpointId'>
/** Compare-and-set progress revision; zero means no prior list. */
export interface ProgressRef {
  readonly revision: number
}
/** Deployment bounds apply to incoming content and the complete result, not historical prior state. */
export interface ProgressLimits {
  /** Maximum milestones retained in one list. */
  readonly maxMilestones: number
  /** Maximum checkpoints retained per milestone. */
  readonly maxCheckpoints: number
  /** Maximum UTF-16 code units per content field. */
  readonly maxTextLength: number
  /** Maximum references per collection. */
  readonly maxReferences: number
  /** Maximum entries per other retained history collection. */
  readonly maxHistory: number
}
/** Trusted caller context, never accepted from model or wire JSON. Human adapters must derive authority from a live interaction. */
export type ProgressAuthority = {
  readonly kind: 'human'
  readonly source: 'command' | 'ui' | 'direct-human-tool'
} | {
  readonly kind: 'maintenance'
}
/** Observed result, not an execution Goal phase. */
export interface ProgressEvidence {
  readonly kind: 'passed' | 'failed'
  readonly summary: string
  readonly references: readonly string[]
}
/** Checkable approved outcome with independently refinable implementation details. */
export interface CheckpointDraft {
  readonly id: CheckpointId
  readonly outcome: string
  readonly detail: string
  readonly references: readonly string[]
}
/** One milestone; checkpoints are the only child entity. */
export interface MilestoneDraft {
  readonly id: MilestoneId
  readonly title: string
  readonly caption: string
  readonly exitCondition: string
  readonly references: readonly string[]
  readonly checkpoints: readonly CheckpointDraft[]
}
/** Completion retains every observed settlement. */
export interface Checkpoint extends CheckpointDraft {
  readonly complete: boolean
  readonly evidence: readonly (ProgressEvidence & ProgressRef)[]
}
/** Durable milestone payload. */
export interface Milestone extends Omit<MilestoneDraft, 'checkpoints'> {
  readonly checkpoints: readonly Checkpoint[]
}
/** Revision-bound human decision, preserved as historical evidence. */
export interface MilestoneDecision extends ProgressRef {
  readonly milestoneId: MilestoneId
}
/** Confirmed external checklist association and settlement state. */
export interface VaultBinding {
  /** Opaque provider identity confirmed with the path; never interpreted as a host path. */
  readonly targetKey: string
  readonly path: string
  readonly fingerprint: string
  readonly mapping: readonly {
    readonly checkpointId: CheckpointId
    readonly marker: string
  }[]
  readonly allowTextRefinement: boolean
  readonly writeback: 'confirmed' | 'suspended'
  readonly settlement: 'synchronized' | 'pending' | 'failed' | 'conflict'
  readonly message: string
}
/** Explicit existing-file association proposal; confirmation is owned by the adapter. */
export interface ChecklistAssociation {
  readonly path: string
  readonly mapping: VaultBinding['mapping']
  readonly allowTextRefinement: boolean
}
/** Durable progress; release records scope permission but never arms execution. */
export interface ProgressView extends ProgressRef {
  readonly milestones: readonly Milestone[]
  readonly approvals: readonly MilestoneDecision[]
  readonly release: MilestoneDecision | null
  readonly acceptances: readonly MilestoneDecision[]
  readonly references: readonly string[]
  readonly goalBinding: {
    readonly goal: GoalRef
    readonly milestoneId: MilestoneId
    readonly checkpointIds: readonly CheckpointId[]
  } | null
  readonly vault: VaultBinding | null
}
/** Bounded objective and explicit consecutive scope for the existing execution Goal. */
export interface AdvanceProgressGoal {
  readonly milestoneId: MilestoneId
  readonly checkpointIds: readonly CheckpointId[]
  readonly objective: string
}
/** Sole domain operation vocabulary; no operation starts or resumes execution. */
export type ProgressChange = {
  readonly kind: 'replace'
  readonly milestones: readonly MilestoneDraft[]
} | {
  readonly kind: 'approve' | 'start' | 'accept'
  readonly milestoneId: MilestoneId
} | {
  readonly kind: 'reconcile'
  readonly checkpointId: CheckpointId
  readonly evidence: ProgressEvidence
} | {
  readonly kind: 'refine'
  readonly checkpointId: CheckpointId
  readonly detail: string
  readonly references: readonly string[]
  /** Concrete implementation-only rationale retained in the Session event. */
  readonly reason: string
} | {
  readonly kind: 'regression'
  readonly historicalCheckpointId: CheckpointId
  readonly milestoneId: MilestoneId
  readonly checkpoint: CheckpointDraft
  readonly insertAt: number
  readonly reason: string
  readonly evidence: ProgressEvidence
} | {
  readonly kind: 'vault-link'
  readonly binding: VaultBinding
} | {
  readonly kind: 'vault-settle'
  readonly fingerprint: string
  readonly settlement: VaultBinding['settlement']
  readonly message: string
} | {
  readonly kind: 'bind-goal'
  readonly binding: NonNullable<ProgressView['goalBinding']>
} | {
  readonly kind: 'references'
  readonly references: readonly string[]
} | {
  /** Records a lightweight review with no newly observed checkpoint evidence. */
  readonly kind: 'review'
  readonly reason: string
}
/** Whole-state durable settlement with the operation needed for strict replay. */
export interface ProgressEvent {
  readonly version: 1
  readonly change: ProgressChange
  readonly authority: ProgressAuthority
  readonly state: ProgressView
}
/** Persistent replay denial; last-good data cannot authorize dependent work. */
export interface ProgressProjectionFailure {
  readonly code: 'PROGRESS_REPLAY_FAILED'
  readonly eventSeq: number
  readonly message: string
}
/** Client status is explicit even when no progress list exists; untrusted current data is display-only. */
export type ProgressProjectionView = {
  readonly status: 'ready'
  readonly current: ProgressView | null
} | {
  readonly status: 'untrusted'
  readonly current: ProgressView | null
  readonly failure: ProgressProjectionFailure
}
/** Projection failures block host reads/mutations and retain the last valid display state. */
export interface ProgressProjectionState {
  readonly current: ProgressView | null
  readonly replay: ProgressView | null
  readonly failure: ProgressProjectionFailure | null
  readonly inheritedEventCount: number
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    longTermProgress: ProgressProjectionState
  }
  interface SessionProjectionMap {
    longTermProgress: ProgressProjectionView
  }
}
