/** Durable Session-local progress service; mutations never schedule execution. @module @deepseek-ai/dsh-long-term-progress */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { authoritySchema, defaultLimits, ProgressError, progressChangeSchema, progressViewSchema, transition } from './domain.ts'
import type { ProgressAuthority,
  ProgressChange,
  ProgressEvent,
  ProgressLimits,
  ProgressProjectionState,
  ProgressRef,
  ProgressView } from './types.ts'
export { registerProgressCommand } from './command.ts'
import './context.ts'
import { registerProgressContext } from './context.ts'
export { registerProgressTools } from './tools.ts'
export { registerProgressGoalTool } from './goals.ts'
import { registerProgressGoals } from './goals.ts'
import { ChecklistSync } from './vault.ts'
import type { ChecklistAssociation } from './types.ts'
import type { AdvanceProgressGoal } from './types.ts'
import type { GoalView } from '@deepseek-ai/dsh-goal'
export type * from './types.ts'
export { ProgressError } from './domain.ts'
declare module '@deepseek-ai/cordis' {
  interface Context {
    longTermProgress: LongTermProgress
  }
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** One committed revision-bound milestone/checkpoint operation, its derived authority and complete post-state for replay validation. */
    'progress/change': ProgressEvent
  }
}
const eventSchema = zod.object({ version: zod.literal(1),
  change: progressChangeSchema,
  authority: authoritySchema,
  state: progressViewSchema }).strict()
const failureSchema = zod.object({
  code: zod.literal('PROGRESS_REPLAY_FAILED'),
  eventSeq: zod.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  message: zod.string().min(1),
}).strict()
const wireSchema = zod.discriminatedUnion('status', [
  zod.object({ status: zod.literal('ready'), current: progressViewSchema.nullable() }).strict(),
  zod.object({ status: zod.literal('untrusted'), current: progressViewSchema.nullable(), failure: failureSchema }).strict(),
])
const projectionSchema = zod.object({ current: progressViewSchema.nullable(),
  replay: progressViewSchema.nullable(),
  failure: failureSchema.nullable(),
  inheritedEventCount: zod.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict().superRefine((state, ctx) => {
  if (state.replay !== null && (state.inheritedEventCount === 0
    || JSON.stringify(inherited(state.replay)) !== JSON.stringify(state.current)))
    ctx.addIssue({ code: 'custom', message: 'inherited progress must match the suspended replay snapshot' })
})
/** Suspend external authority for inherited snapshots without modifying parent state. */
function inherited(view: ProgressView): ProgressView {
  return { ...view, vault: view.vault === null ? null : { ...view.vault, writeback: 'suspended' }, goalBinding: null }
}
/** Validate and fold one committed event, retaining a visible failure on corruption. */
function fold(state: ProgressProjectionState, event: SessionEvent): ProgressProjectionState {
  if (event.type !== 'progress/change' || state.failure !== null)
    return state
  try {
    const data = eventSchema.parse(event.data)
    // Replay admission uses protocol maxima rather than today's deployment limits.
    const limits = { maxMilestones: Number.MAX_SAFE_INTEGER,
      maxCheckpoints: Number.MAX_SAFE_INTEGER,
      maxTextLength: Number.MAX_SAFE_INTEGER,
      maxReferences: Number.MAX_SAFE_INTEGER,
      maxHistory: Number.MAX_SAFE_INTEGER }
    const isInherited = event.seq < state.inheritedEventCount
    const previous = isInherited ? state.replay : state.current
    const expected = transition(previous, { revision: previous?.revision ?? 0 }, data.change, data.authority, limits)
    const candidate = isInherited ? inherited(data.state) : data.state
    const normalized = isInherited ? inherited(expected) : expected
    if (JSON.stringify(normalized) !== JSON.stringify(candidate))
      throw new Error('durable state does not match transition')
    return { ...state, current: candidate, replay: isInherited ? data.state : null }
  }
  catch (error) {
    return { ...state,
      failure: {
        code: 'PROGRESS_REPLAY_FAILED', eventSeq: event.seq,
        message: `progress replay failed at event ${event.seq}: ${error instanceof Error ? error.message : String(error)}`,
      } }
  }
}
/** Progress admission configuration; omitted fields use the documented deployment defaults. */
export interface Config extends Partial<ProgressLimits> {
  /** Complete checklist byte limit; larger files reject before synchronization. */
  maxChecklistBytes?: number
}
/** Owns the sole synchronous append-before-publish mutation path. */
export class LongTermProgress extends TypertRemoteService {
  static inject = ['agents', 'sessionProjections']
  static Config: z<Config> = z.object({
    maxMilestones: z.number().default(defaultLimits.maxMilestones),
    maxCheckpoints: z.number().default(defaultLimits.maxCheckpoints),
    maxTextLength: z.number().default(defaultLimits.maxTextLength),
    maxReferences: z.number().default(defaultLimits.maxReferences),
    maxHistory: z.number().default(defaultLimits.maxHistory),
    maxChecklistBytes: z.number().default(1048576),
  })
  private readonly checklist: ChecklistSync
  private advance: ReturnType<typeof registerProgressGoals> | undefined
  private disposed = false
  private readonly limits: ProgressLimits
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'longTermProgress')
    const { maxChecklistBytes = 1048576, ...limits } = config
    this.limits = { ...defaultLimits, ...limits }
    if (!Number.isSafeInteger(maxChecklistBytes) || maxChecklistBytes < 1) throw new Error('maxChecklistBytes must be a positive safe integer')
    this.checklist = new ChecklistSync(ctx, maxChecklistBytes)
    for (const value of Object.values(this.limits))
      if (!Number.isSafeInteger(value) || value < 1)
        throw new Error('progress limits must be positive safe integers')
    const definition = {
      key: 'longTermProgress', stateVersion: 5, stateSchema: projectionSchema,
      init: (_header, inheritedEventCount) => ({ current: null, replay: null, failure: null, inheritedEventCount }),
      apply: fold,
      wire: { viewSchema: wireSchema, view: state => state.failure === null
        ? { status: 'ready', current: state.current }
        : { status: 'untrusted', current: state.current, failure: state.failure } },
    } satisfies ProjectionDefinition<'longTermProgress'>
    ctx.sessionProjections.register<'longTermProgress', ProgressProjectionState>(definition)
    ctx.effect(() => () => { this.disposed = true })
    registerProgressContext(ctx)
    ctx.on('agent/pre-step', async ({ agent, signal, step }, next) => {
      const decision = await next()
      if (step === 1 && decision.kind === 'enter' && decision.messages.length > 0 && !signal.aborted)
        await this.checklist.sync(agent, signal)
      return decision
    })
    ctx.on('tools/post-execute', async (exec, _result, next) => {
      const settled = await next()
      if (exec.agent !== undefined && !exec.signal.aborted
        && ['update_progress', 'link_progress_checklist', 'sync_progress_checklist'].includes(exec.name))
        await this.checklist.sync(exec.agent, exec.signal)
      return settled
    })
    ctx.inject(['goals'], (consumer) => {
      this.advance = registerProgressGoals(consumer)
      consumer.effect(() => () => { this.advance = undefined })
    })
  }
  /** Commit one owner UI decision against the exact displayed revision; never executes work.
   * @param agent - owning live Agent resolved by the Gateway.
   * @param ref - revision displayed by the Client.
   * @param request - human list edit, authorization, evidence or historical repair; internal bindings are refused.
   * @returns committed projected state. */
  @Remote('update')
  updateFromOwner(agent: Agent, ref: ProgressRef, request: ProgressChange): ProgressView {
    const invocation = this.ctx.invocation
    if (invocation?.peer.principal.kind !== 'owner') throw new ProgressError('progress mutations require an authenticated owner UI invocation')
    invocation.signal.throwIfAborted()
    const change = progressChangeSchema.parse(request)
    if (change.kind === 'bind-goal' || change.kind === 'vault-link' || change.kind === 'vault-settle')
      throw new ProgressError('internal progress bindings require their dedicated operation')
    return this.change(agent, ref, change, { kind: 'human', source: 'ui' })
  }
  /** Read detached durable state for an exact live Agent; corrupt replay rejects with PROGRESS_REPLAY_FAILED.
 * @param agent - owning live Agent.
 * @returns trusted projected state or null before creation; last-good failure data is wire-display-only. */
  get(agent: Agent): ProgressView | null {
    this.assertLive(agent)
    const state = this.ctx.sessionProjections.stateOf(agent.session, 'longTermProgress')
    if (state === undefined)
      throw new Error('progress projection is not registered')
    if (state.failure !== null)
      throw new ProgressError(state.failure.message, state.failure.code)
    return state.current === null ? null : structuredClone(state.current)
  }
  /** Commit one revision-bound operation; trusted adapters derive authority outside JSON.
 * @param agent - owning live Agent.
 * @param ref - expected current revision.
 * @param change - validated domain operation.
 * @param authority - trusted live adapter authority.
 * @returns committed detached state. */
  change(agent: Agent, ref: ProgressRef, change: ProgressChange, authority: ProgressAuthority): ProgressView {
    const current = this.get(agent)
    const state = transition(current, { revision: ref.revision }, change, authority, this.limits)
    const event: ProgressEvent = { version: 1, change: structuredClone(change), authority: structuredClone(authority), state }
    agent.session.append('progress/change', event)
    const committed = this.get(agent)
    if (committed === null)
      throw new Error('progress append did not publish state')
    return committed
  }
  /** Advance only a fresh process-local released checkpoint group using the existing execution Goal.
   * @param agent - exact live owner.
   * @param ref - expected progress revision.
   * @param request - consecutive checkpoint group and objective.
   * @returns created or edited Goal; never resumes paused or disarmed work. */
  advanceGoal(agent: Agent, ref: ProgressRef, request: AdvanceProgressGoal): GoalView {
    this.assertLive(agent)
    if (this.advance === undefined) throw new ProgressError('Goal integration is unavailable')
    return this.advance(agent, ref, request)
  }
  /** Confirm an existing checklist and its standing permissions without creating a file.
   * @param agent - exact live owner.
   * @param ref - expected progress revision.
   * @param request - exact file and stable checkpoint mappings.
   * @param signal - caller cancellation.
   * @returns committed association after confirmation and freshness recheck. */
  linkChecklist(agent: Agent, ref: ProgressRef, request: ChecklistAssociation, signal: AbortSignal): Promise<ProgressView> {
    this.assertLive(agent)
    return this.checklist.link(agent, ref, request, signal)
  }
  /** Retry independently settled checklist synchronization under confirmed standing permission.
   * @param agent - exact live owner.
   * @param signal - caller cancellation.
   * @returns completion after visible synchronization, conflict or error settlement. */
  syncChecklist(agent: Agent, signal: AbortSignal): Promise<void> {
    this.assertLive(agent)
    return this.checklist.sync(agent, signal)
  }
  private assertLive(agent: Agent): void {
    if (this.disposed)
      throw new Error('progress service is disposed')
    if (this.ctx.agents.get(agent.id) !== agent)
      throw new Error('progress Agent is not live')
  }
}
export default LongTermProgress
