/** Validated pure progress transitions and ordered scope checks. @module */
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CheckpointId, MilestoneId, ProgressAuthority, ProgressLimits, ProgressRef, ProgressView } from './types.ts'
/** Structured admission or replay denial. Transition failures append nothing; replay failures follow a committed event. */
export class ProgressError extends Error {
  constructor(message: string, readonly code: 'PROGRESS_INVALID' | 'PROGRESS_STALE' | 'PROGRESS_REPLAY_FAILED' = 'PROGRESS_INVALID') {
    super(message)
    this.name = 'ProgressError'
  }
}
/** Default admission bounds; deployments may supply stricter or larger positive safe integers. */
export const defaultLimits: ProgressLimits = { maxMilestones: 64,
  maxCheckpoints: 256,
  maxTextLength: 4096,
  maxReferences: 64,
  maxHistory: 1024 }
/** Admit a stable milestone identifier. @param value - external identifier. @returns branded validated identity. */
export function milestoneId(value: string): MilestoneId { return brandString<MilestoneId>(idSchema.parse(value)) }
/** Admit a stable checkpoint identifier. @param value - external identifier. @returns branded validated identity. */
export function checkpointId(value: string): CheckpointId { return brandString<CheckpointId>(idSchema.parse(value)) }
const idSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
const mid = idSchema.transform(value => brandString<MilestoneId>(value))
const cid = idSchema.transform(value => brandString<CheckpointId>(value))
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const text = z.string().max(1000000)
const requiredText = text.refine(value => value.trim().length > 0, 'concrete text required')
const references = z.array(requiredText)
const evidence = z.object({ kind: z.enum(['passed', 'failed']), summary: requiredText, references: references.min(1) }).strict()
const checkpoint = z.object({ id: cid, outcome: requiredText, detail: text, references }).strict()
const milestone = z.object({ id: mid,
  title: requiredText,
  caption: requiredText,
  exitCondition: requiredText,
  references,
  checkpoints: z.array(checkpoint) }).strict()
const decision = z.object({ milestoneId: mid, revision }).strict()
const vault = z.object({ path: requiredText,
  fingerprint: requiredText,
  mapping: z.array(z.object({ checkpointId: cid,
    marker: requiredText }).strict()),
  allowTextRefinement: z.boolean(),
  writeback: z.enum(['confirmed',
    'suspended']),
  settlement: z.enum(['synchronized',
    'pending',
    'failed',
    'conflict']),
  message: text }).strict()
const goalBinding = z.object({ goal: z.object({ id: idSchema,
  revision: revision.refine(n => n > 0) }).strict(),
milestoneId: mid,
checkpointIds: z.array(cid).min(1) }).strict()
/** Strict model/command input schema; trusted authority is supplied separately. */
export const progressChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('replace'), milestones: z.array(milestone) }).strict(),
  ...(['approve', 'start', 'accept'] as const).map(kind => z.object({ kind: z.literal(kind), milestoneId: mid }).strict()),
  z.object({ kind: z.literal('reconcile'), checkpointId: cid, evidence }).strict(),
  z.object({ kind: z.literal('refine'), checkpointId: cid, detail: text, references, reason: requiredText }).strict(),
  z.object({ kind: z.literal('regression'),
    historicalCheckpointId: cid,
    milestoneId: mid,
    checkpoint,
    insertAt: revision,
    reason: requiredText,
    evidence }).strict(),

  z.object({ kind: z.literal('vault-link'), binding: vault }).strict(),
  z.object({ kind: z.literal('vault-settle'), fingerprint: requiredText, settlement: vault.shape.settlement, message: text }).strict(),
  z.object({ kind: z.literal('bind-goal'), binding: goalBinding }).strict(),
  z.object({ kind: z.literal('references'), references }).strict(),
])
/** Strict durable/wire state schema with identity, evidence and authority invariants. */
export const progressViewSchema = z.object({
  revision: revision.refine(n => n > 0),
  milestones: z.array(milestone.extend({ checkpoints: z.array(checkpoint.extend({ complete: z.boolean(),
    evidence: z.array(evidence.extend({ revision })) }).strict()) }).strict()),

  approvals: z.array(decision), release: decision.nullable(), acceptances: z.array(decision), references,
  goalBinding: goalBinding.extend({ goal: goalBinding.shape.goal.extend({ id: idSchema.transform(value => brandString<import('@deepseek-ai/dsh-goal/types').GoalId>(value)) }) }).nullable(),
  vault: vault.nullable(),

}).strict().superRefine((state, ctx) => {
  const reject = (message: string) => { ctx.addIssue({ code: 'custom', message }) }
  const identities = state.milestones.flatMap(m => [m.id, ...m.checkpoints.map(c => c.id)])
  if (new Set(identities).size !== identities.length)
    reject('progress identities must be unique')
  const decisions = [...state.approvals, ...state.acceptances, ...state.release === null ? [] : [state.release]]
  if (decisions.some(d => d.revision < 1 || d.revision > state.revision
    || !state.milestones.some(m => m.id === d.milestoneId)))
    reject('milestone decision requires an existing milestone and committed revision')
  for (const m of state.milestones) {
    for (const c of m.checkpoints) {
      if (c.complete !== (c.evidence.at(-1)?.kind === 'passed'))
        reject('completion requires latest passing evidence')
      if (c.evidence.some((e, index) => e.revision < 1 || e.revision > state.revision
        || e.revision <= (c.evidence[index - 1]?.revision ?? 0)))
        reject('checkpoint evidence requires increasing committed revisions')
    }
  }
  if (new Set(state.acceptances.map(a => a.milestoneId)).size !== state.acceptances.length)
    reject('milestone acceptance must be unique')
  const settlementRevisions = [...decisions.map(d => d.revision),
    ...state.milestones.flatMap(m => m.checkpoints.flatMap(c => c.evidence.map(e => e.revision)))]
  if (new Set(settlementRevisions).size !== settlementRevisions.length)
    reject('progress settlements require distinct committed revisions')
  for (const accepted of state.acceptances) {
    if (!state.approvals.some(a => a.milestoneId === accepted.milestoneId && a.revision < accepted.revision))
      reject('acceptance requires an earlier milestone approval')
    const m = state.milestones.find(value => value.id === accepted.milestoneId)
    if (m === undefined || m.checkpoints.length === 0 || m.checkpoints.some(c => !c.complete
      || (c.evidence.at(-1)?.revision ?? state.revision) >= accepted.revision))
      reject('acceptance requires earlier completed checkpoint evidence')
  }
  if (state.release !== null && (currentMilestone(state)?.id !== state.release.milestoneId
    || !state.approvals.some(a => a.milestoneId === state.release?.milestoneId && a.revision < state.release.revision)))
    reject('release requires an earlier approval for the current milestone')
  if (state.goalBinding !== null) {
    const binding = state.goalBinding
    const m = currentMilestone(state)
    const start = m?.checkpoints.findIndex(c => c.id === binding.checkpointIds[0]) ?? -1
    if (state.release?.milestoneId !== binding.milestoneId || m?.id !== binding.milestoneId
      || start < 0 || !binding.checkpointIds.every((id, index) => m.checkpoints[start + index]?.id === id))
      reject('Goal binding requires consecutive checkpoints in the released milestone')
  }
})
/** Durable authority identifies an already authenticated adapter decision, not a model argument. */
export const authoritySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('human'), source: z.enum(['command', 'ui', 'direct-human-tool']) }).strict(),
  z.object({ kind: z.literal('maintenance') }).strict(),
])
/** Select the first milestone not yet accepted. @param state - current state. @returns milestone or null when none remains. */
export function currentMilestone(state: ProgressView) {
  return state.milestones.find(m => !state.acceptances.some(a => a.milestoneId === m.id)) ?? null
}
/** Check a consecutive unfinished prefix within the released milestone.
 * @param state - current state.
 * @param id - requested milestone.
 * @param ids - ordered checkpoint group.
 * @returns whether scope is eligible. */
export function eligibleCheckpoints(state: ProgressView, id: MilestoneId, ids: readonly CheckpointId[]): boolean {
  const current = currentMilestone(state)
  if (current === null || current.id !== id || state.release?.milestoneId !== id || ids.length === 0)
    return false
  const first = current.checkpoints.findIndex(c => !c.complete)
  if (first < 0 || first + ids.length > current.checkpoints.length)
    return false
  return ids.every((value, index) => current.checkpoints[first + index]?.id === value && !current.checkpoints[first + index]?.complete)
}
/** Bound content and retained collections without applying text limits to protocol literals or IDs. */
function checkBounds(value: unknown, limits: ProgressLimits, field = ''): void {
  const content = ['title', 'caption', 'exitCondition', 'outcome', 'detail', 'references',
    'summary', 'path', 'fingerprint', 'marker', 'message', 'reason']
  if (typeof value === 'string' && content.includes(field) && value.length > limits.maxTextLength)
    throw new ProgressError('progress text limit exceeded')
  if (Array.isArray(value)) {
    for (const item of value)
      checkBounds(item, limits, field)
    return
  }
  if (typeof value !== 'object' || value === null)
    return
  for (const [key, item] of Object.entries(value)) {
    if (Array.isArray(item)) {
      const limit = key === 'milestones' ? limits.maxMilestones : key === 'checkpoints' ? limits.maxCheckpoints : key === 'references' ? limits.maxReferences : limits.maxHistory
      if (item.length > limit)
        throw new ProgressError(`progress ${key} limit exceeded`)
    }
    checkBounds(item, limits, key)
  }
}
/** Apply one validated revision-bound change without effects.
 * @param previous - prior state, null before creation.
 * @param ref - expected revision.
 * @param input - untrusted operation.
 * @param authority - trusted adapter authority.
 * @param limits - admission bounds for incoming content and the result, not historical prior state.
 * @returns detached next durable state; throws without effects on schema, authority or admission denial. */
export function transition(previous: ProgressView | null,
  ref: ProgressRef,
  input: unknown,
  authority: ProgressAuthority,
  limits: ProgressLimits): ProgressView {
  for (const value of Object.values(limits))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ProgressError('progress limits must be positive safe integers')
  z.object({ revision }).strict().parse(ref)
  if (ref.revision !== (previous?.revision ?? 0))
    throw new ProgressError('stale progress revision', 'PROGRESS_STALE')
  const change = progressChangeSchema.parse(input)
  checkBounds(change, limits)
  authoritySchema.parse(authority)
  if (['replace', 'approve', 'start', 'accept', 'vault-link', 'references'].includes(change.kind) && authority.kind !== 'human')
    throw new ProgressError('human authority required')
  const state: ProgressView = previous === null
    ? { revision: 0, milestones: [], approvals: [], release: null, acceptances: [], references: [], goalBinding: null, vault: null }
    : progressViewSchema.parse(previous)
  const next = state.revision + 1
  if (!Number.isSafeInteger(next))
    throw new ProgressError('progress revision exhausted')
  let result: ProgressView = { ...state, revision: next }
  const current = currentMilestone(state)
  const requireCurrent = (id: MilestoneId) => {
    if (current === null || current.id !== id)
      throw new ProgressError('operation requires current milestone')
    return current
  }
  switch (change.kind) {
    case 'replace': {
      const checkpoints = new Map(state.milestones.flatMap(m => m.checkpoints.map(c => [c.id, c] as const)))
      result = { ...result, milestones: change.milestones.map(m => ({ ...m, checkpoints: m.checkpoints.map((c) => {
        const old = checkpoints.get(c.id)
        if (old !== undefined && old.outcome !== c.outcome && old.evidence.length > 0)
          throw new ProgressError('changed evidenced outcomes require a new checkpoint identity')
        return { ...c, complete: old?.complete ?? false, evidence: old?.evidence ?? [] }
      }) })),
      approvals: state.approvals.filter(a => state.acceptances.some(accepted => accepted.milestoneId === a.milestoneId)),
      release: null, goalBinding: null }
      if (state.acceptances.length > 0) {
        for (const accepted of state.acceptances) {
          const before = state.milestones.find(m => m.id === accepted.milestoneId)
          const after = change.milestones.find(m => m.id === accepted.milestoneId)
          if (before === undefined || after === undefined || JSON.stringify({ ...before,
            checkpoints: before.checkpoints.map(({ complete: _complete,
              evidence: _evidence,
              ...c }) => c) }) !== JSON.stringify(after))
            throw new ProgressError('accepted milestones cannot be rewritten')
        }
        result = { ...result,
          milestones: result.milestones.map(m => state.acceptances.some(a => a.milestoneId === m.id)
            ? (state.milestones.find(old => old.id === m.id) ?? m) : m) }
      }
      break
    }
    case 'approve':
      requireCurrent(change.milestoneId)
      result = { ...result, approvals: [...state.approvals, { milestoneId: change.milestoneId, revision: next }] }
      break
    case 'start':
      requireCurrent(change.milestoneId)
      if (!state.approvals.some(a => a.milestoneId === change.milestoneId))
        throw new ProgressError('milestone must be approved before release')
      result = { ...result, release: { milestoneId: change.milestoneId, revision: next } }
      break
    case 'accept': {
      const m = requireCurrent(change.milestoneId)
      if (m.checkpoints.length === 0 || !m.checkpoints.every(c => c.complete))
        throw new ProgressError('acceptance requires checkpoint evidence')
      if (!state.approvals.some(a => a.milestoneId === m.id))
        throw new ProgressError('acceptance requires approved milestone')
      result = { ...result,
        acceptances: [...state.acceptances,
          { milestoneId: m.id,
            revision: next }],
        release: null,
        goalBinding: null }
      break
    }
    case 'reconcile':
    case 'refine': {
      if (current === null || !current.checkpoints.some(c => c.id === change.checkpointId))
        throw new ProgressError('checkpoint is not in current milestone')
      if (change.kind === 'refine' && !state.approvals.some(a => a.milestoneId === current.id))
        throw new ProgressError('refinement requires approved milestone')
      result = { ...result,
        milestones: state.milestones.map(m => m.id !== current.id ? m : { ...m,
          checkpoints: m.checkpoints.map(c => c.id !== change.checkpointId ? c : change.kind === 'refine' ? { ...c,
            detail: change.detail,
            references: change.references } : { ...c,
            complete: change.evidence.kind === 'passed',
            evidence: [...c.evidence,
              { ...change.evidence,
                revision: next }] }) }) }
      break
    }
    case 'regression': {
      const m = requireCurrent(change.milestoneId)
      const historical = state.milestones.find(old => old.checkpoints.some(c => c.id === change.historicalCheckpointId))
      if (historical === undefined || !state.acceptances.some(a => a.milestoneId === historical.id) || change.evidence.kind !== 'failed')
        throw new ProgressError('historical regression requires accepted checkpoint and failed evidence')
      if (change.insertAt > m.checkpoints.length || m.checkpoints.slice(change.insertAt).some(c => c.complete))
        throw new ProgressError('unsafe repair position')
      const repair = { ...change.checkpoint, complete: false, evidence: [{ ...change.evidence, revision: next }] }
      result = { ...result,
        goalBinding: null,
        milestones: state.milestones.map(old => old.id !== m.id ? old : { ...old,
          checkpoints: [...old.checkpoints.slice(0,
            change.insertAt),
          repair,
          ...old.checkpoints.slice(change.insertAt)] }) }
      break
    }
    case 'vault-link':
      if (change.binding.writeback !== 'confirmed')
        throw new ProgressError('human link must confirm vault writeback')
      result = { ...result, vault: change.binding }
      break
    case 'vault-settle':
      if (state.vault === null || state.vault.writeback !== 'confirmed')
        throw new ProgressError('vault writeback is not confirmed')
      result = { ...result,
        vault: { ...state.vault,
          fingerprint: change.fingerprint,
          settlement: change.settlement,
          message: change.message } }
      break
    case 'bind-goal':
      if (!eligibleCheckpoints(state, change.binding.milestoneId, change.binding.checkpointIds))
        throw new ProgressError('Goal binding is outside released consecutive scope')
      result = { ...result,
        goalBinding: { ...change.binding,
          goal: { ...change.binding.goal,
            id: brandString<import('@deepseek-ai/dsh-goal/types').GoalId>(change.binding.goal.id) } } }
      break
    case 'references':
      result = { ...result, references: change.references }
      break
    default: {
      const unreachable: never = change
      throw new ProgressError(`unsupported progress change ${String(unreachable)}`)
    }
  }
  checkBounds(result, limits)
  return progressViewSchema.parse(result)
}
