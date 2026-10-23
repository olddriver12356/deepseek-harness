/** Compact, logged progress context at the first admitted request of each turn. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Milestone, ProgressView } from './types.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'long-term-progress': { kind: 'long-term-progress'; revision: number } & import('@deepseek-ai/dsh-llm').ContextFormed
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    longTermProgressContext: { admitted: boolean; revision: number | null; needsReview: boolean }
  }
}

/** Derive display-only milestone status without granting execution permission.
 * @param view - current trusted state.
 * @param milestone - milestone in that state.
 * @returns compact verification or authorization status. */
export function milestoneStatus(view: ProgressView, milestone: Milestone): string {
  if (view.acceptances.some(a => a.milestoneId === milestone.id)) return 'accepted'
  if (milestone.checkpoints.length > 0 && milestone.checkpoints.every(c => c.complete)) return 'awaiting verification'
  if (view.release?.milestoneId === milestone.id) return 'released'
  if (view.approvals.some(a => a.milestoneId === milestone.id)) return 'approved; awaiting start'
  return 'awaiting authorization'
}

/** Return captions and counts only, without checkpoint bodies or document references.
 * @param view - current progress or no list.
 * @returns compact selective-read value. */
export function compactProgress(view: ProgressView | null): {
  revision: number
  milestones: { id: Milestone['id']; title: string; caption: string; complete: number; total: number; status: string }[]
} {
  return {
    revision: view?.revision ?? 0,
    milestones: view?.milestones.map(m => ({
      id: m.id, title: m.title, caption: m.caption,
      complete: m.checkpoints.filter(c => c.complete).length,
      total: m.checkpoints.length, status: milestoneStatus(view, m),
    })) ?? [],
  }
}

/** Render the complete milestone-caption snapshot; no checkpoint or evidence bodies.
 * @param view - current trusted progress.
 * @returns model-visible context text. */
export function renderProgressReminder(view: ProgressView): string {
  const lines = compactProgress(view).milestones.map(m =>
    `${m.id}: ${m.title} — ${m.caption} (${m.complete}/${m.total}; ${m.status})`)
  return [
    `Long-term progress revision ${view.revision}; this supersedes all earlier progress snapshots.`,
    ...lines.length === 0 ? ['No milestones are currently set.'] : lines,
    'This list is context and bookkeeping, not execution authorization. Work only within the current released milestone; '
      + 'stop at its boundary for human verification and explicit release of the next milestone. '
      + 'Use read_progress for checkpoint details and references. Read supplementary material or ask the user when intent is unclear.',
  ].join('\n')
}

/** Register admission-owned snapshot cadence and its disposable pre-step listener.
 * @param ctx - owning plugin context with progress and projection services. */
export function registerProgressContext(ctx: Context): void {
  ctx.sessionProjections.register({
    key: 'longTermProgressContext', stateVersion: 2,
    stateSchema: z.object({
      admitted: z.boolean(), revision: z.number().int().nonnegative().nullable(), needsReview: z.boolean(),
    }).strict(),
    init: () => ({ admitted: false, revision: null, needsReview: false }),
    apply: (state, event) => {
      if (event.type === 'turn/start' || event.type === 'turn/end') return { ...state, admitted: false }
      if (event.type === 'user/message' && event.data.source.kind === 'long-term-progress')
        return { ...state, admitted: true, revision: event.data.source.revision }
      if (event.type === 'goal/change' && (event.data.operation === 'create' || event.data.operation === 'edit'))
        return { ...state, needsReview: true }
      if (event.type === 'progress/change' && (event.data.change.kind === 'review' || event.data.change.kind === 'reconcile'))
        return { ...state, needsReview: false }
      return state
    },
  })
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || decision.messages.length === 0) return decision
    const cadence = ctx.sessionProjections.stateOf(agent.session, 'longTermProgressContext')
    if (cadence === undefined) throw new Error('progress context projection is not registered')
    if (cadence.admitted) return decision
    const view = ctx.longTermProgress.get(agent)
    if (view === null || (view.milestones.length === 0 && cadence.revision === view.revision)) return decision
    const text = renderProgressReminder(view) + (cadence.needsReview
      ? '\nGoal scope changed. First reconcile recent observed outcomes with update_progress reconcile, or record review with a concrete reason when there is no new evidence. Use recent context and targeted checks only; no broad audit.' : '')
    return { ...decision, messages: [...decision.messages, createUserMessage({
      content: [{ type: 'text', text }],
      source: { kind: 'long-term-progress', revision: view.revision, form: 'snapshot', sections: [{ name: 'long-term-progress', text }] },
    })] }
  }, { prepend: true })
}
