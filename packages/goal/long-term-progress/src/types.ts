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
/** Deployment bounds applied before durable admission. */
export interface ProgressLimits {
  readonly maxMilestones: number
  readonly maxCheckpoints: number
  readonly maxTextLength: number
  readonly maxReferences: number
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
}
/** Whole-state durable settlement with the operation needed for strict replay. */
export interface ProgressEvent {
  readonly version: 1
  readonly change: ProgressChange
  readonly authority: ProgressAuthority
  readonly state: ProgressView
}
/** Projection failures block host mutation and retain the last valid display state. */
export interface ProgressProjectionState {
  readonly current: ProgressView | null
  readonly replay: ProgressView | null
  readonly failure: string | null
  readonly inheritedEventCount: number
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    longTermProgress: ProgressProjectionState
  }
  interface SessionProjectionMap {
    longTermProgress: ProgressView | null
  }
}
