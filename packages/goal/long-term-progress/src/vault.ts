/** Stable-marker checklist planning and independently settled, provider-guarded synchronization. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { FsError, type FsTarget } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-questions'
import { ProgressError } from './domain.ts'
import type { ChecklistAssociation, ProgressRef, ProgressView, VaultBinding } from './types.ts'

interface ChecklistEntry { marker: string; checked: boolean; text: string; start: number; end: number; prefix: string; suffix: string }
/** Inspect only explicitly mapped stable HTML markers; duplicate or missing identities reject.
 * @param text - exact file text, including original newline bytes.
 * @param binding - confirmed checkpoint-to-marker mapping.
 * @returns mapped entries in mapping order. */
export function inspectChecklist(text: string, binding: Pick<VaultBinding, 'mapping'>): { entries: ChecklistEntry[] } {
  const found = new Map<string, ChecklistEntry>()
  const duplicates = new Set<string>()
  const pattern = /^([\t ]*[-*+] \[)([ xX])(\] )([^\r\n]*?)([\t ]*<!-- dsh:([a-zA-Z0-9._:-]+) -->[^\r\n]*)$/gmu
  for (const match of text.matchAll(pattern)) {
    const marker = match[6] ?? ''
    if (found.has(marker)) duplicates.add(marker)
    found.set(marker, { marker, checked: match[2]?.toLowerCase() === 'x', text: match[4] ?? '',
      start: match.index, end: match.index + match[0].length, prefix: match[1] ?? '', suffix: match[5] ?? '' })
  }
  const ids = binding.mapping.map(m => m.checkpointId)
  const markers = binding.mapping.map(m => m.marker)
  if (new Set(ids).size !== ids.length || new Set(markers).size !== markers.length) throw new ProgressError('duplicate checklist mapping')
  const entries = binding.mapping.map((m) => {
    if (duplicates.has(m.marker)) throw new ProgressError(`duplicate checklist marker ${m.marker}`)
    const entry = found.get(m.marker)
    if (entry === undefined) throw new ProgressError(`missing checklist marker ${m.marker}`)
    return entry
  })
  return { entries }
}

/** Plan replacements only within mapped checklist lines; unrelated text and line endings are unchanged.
 * @param text - exact current file contents.
 * @param state - trusted Session progress.
 * @param binding - confirmed checkbox and optional text permissions.
 * @returns complete replacement text and whether any mapped field changes. */
export function planChecklistWrite(text: string, state: ProgressView, binding: VaultBinding): { text: string; changed: boolean } {
  const { entries } = inspectChecklist(text, binding)
  let result = text
  for (const entry of entries.toSorted((a, b) => b.start - a.start)) {
    const mapping = binding.mapping.find(m => m.marker === entry.marker)
    const checkpoint = state.milestones.flatMap(m => m.checkpoints).find(c => c.id === mapping?.checkpointId)
    if (checkpoint === undefined) throw new ProgressError(`missing Session checkpoint for marker ${entry.marker}`)
    const label = binding.allowTextRefinement ? checkpoint.outcome + (checkpoint.detail === '' ? '' : ` — ${checkpoint.detail}`) : entry.text
    if (/[\r\n]/u.test(label)) throw new ProgressError('checklist text must fit one line')
    const line = `${entry.prefix}${checkpoint.complete ? 'x' : ' '}] ${label}${entry.suffix}`
    result = result.slice(0, entry.start) + line + result.slice(entry.end)
  }
  return { text: result, changed: result !== text }
}
function fingerprint(text: string): string { return createHash('sha256').update(text).digest('hex') }

/** Filesystem adapter owned by one progress-service lifetime; all I/O uses the composed provider. */
export class ChecklistSync {
  private readonly lifetime = new AbortController()
  private readonly active = new Map<Agent, Promise<void>>()
  private readonly links = new Set<Promise<ProgressView>>()
  constructor(private readonly ctx: Context, private readonly maxBytes: number) {
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await Promise.allSettled([...this.active.values(), ...this.links])
    })
  }
  private async read(agent: Agent, path: string, signal: AbortSignal) {
    const fs = this.ctx.get('fs')
    if (fs === undefined) throw new ProgressError('checklist synchronization requires the filesystem service')
    const target = await fs.resolve(path, { ...agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }, signal })
    const before = await fs.stat(target, signal)
    if (before?.type !== 'file') throw new ProgressError('checklist association requires an existing regular file')
    if (before.size !== undefined && before.size > this.maxBytes) throw new ProgressError('checklist file exceeds configured byte limit')
    const text = await fs.readText(target, signal)
    if (Buffer.byteLength(text) > this.maxBytes) throw new ProgressError('checklist file exceeds configured byte limit')
    const after = await fs.stat(target, signal)
    if (before.version !== after?.version) throw new ProgressError('checklist changed during read')
    return { fs, target, version: before.version, text, fingerprint: fingerprint(text) }
  }
  private current(agent: Agent, revision: number, signal: AbortSignal) {
    signal.throwIfAborted()
    const state = this.ctx.longTermProgress.get(agent)
    if (state === null || state.revision !== revision) throw new ProgressError('stale progress revision', 'PROGRESS_STALE')
    return state
  }
  private async confirm(agent: Agent, detail: string, signal: AbortSignal) {
    const questions = this.ctx.get('userQuestions')
    if (questions === undefined) throw new ProgressError('checklist confirmation requires user interaction')
    const result = await questions.ask({ agent, signal, questions: [{ id: 'checklist',
      question: 'Confirm this exact existing checklist association or synchronization?', detail,
      options: [{ label: 'Confirm' }, { label: 'Cancel' }] }] })
    signal.throwIfAborted()
    const answer = result.answers.find(a => a.id === 'checklist')
    if (answer?.selected.length !== 1 || answer.selected[0] !== 'Confirm' || answer.custom) throw new ProgressError('checklist change not confirmed')
  }
  /** Confirm an exact existing target and mapping without modifying the file.
   * @param agent - live Session owner.
   * @param ref - progress revision shown for confirmation.
   * @param request - proposed file, stable marker mapping and separate text permission.
   * @param outer - caller cancellation.
   * @returns committed association; rejects stale file or Session confirmation. */
  link(agent: Agent, ref: ProgressRef, request: ChecklistAssociation, outer: AbortSignal): Promise<ProgressView> {
    const run = this.linkOperation(agent, ref, request, outer)
    this.links.add(run)
    void run.finally(() => { this.links.delete(run) }).catch((error: unknown) => {
      this.ctx.logger.debug('checklist association stopped: %s', error)
    })
    return run
  }
  private async linkOperation(agent: Agent, ref: ProgressRef, request: ChecklistAssociation, outer: AbortSignal): Promise<ProgressView> {
    const signal = AbortSignal.any([outer, this.lifetime.signal])
    const state = this.current(agent, ref.revision, signal)
    const file = await this.read(agent, request.path, signal)
    inspectChecklist(file.text, request)
    if (request.mapping.some(m => !state.milestones.some(ms => ms.checkpoints.some(c => c.id === m.checkpointId))))
      throw new ProgressError('checklist mapping names an unknown checkpoint')
    await this.confirm(agent, JSON.stringify({ path: file.target.displayPath, fingerprint: file.fingerprint,
      mapping: request.mapping, checkboxPermission: true, textPermission: request.allowTextRefinement }, null, 2), signal)
    this.current(agent, ref.revision, signal)
    const reread = await this.read(agent, file.target.displayPath, signal)
    if (reread.target.targetKey !== file.target.targetKey || reread.fingerprint !== file.fingerprint)
      throw new ProgressError('checklist changed after confirmation')
    this.current(agent, ref.revision, signal)
    return this.ctx.longTermProgress.change(agent, ref, { kind: 'vault-link', binding: {
      targetKey: file.target.targetKey, path: file.target.displayPath, fingerprint: file.fingerprint, mapping: request.mapping,
      allowTextRefinement: request.allowTextRefinement, writeback: 'confirmed', settlement: 'pending', message: 'Association confirmed; synchronization pending.',
    } }, { kind: 'human', source: 'direct-human-tool' })
  }
  /** Synchronize under standing permission; per-Agent requests share one owned operation.
   * @param agent - live owner.
   * @param outer - caller cancellation.
   * @returns when the file and visible Session settlement have completed or failed. */
  sync(agent: Agent, outer: AbortSignal): Promise<void> {
    const existing = this.active.get(agent)
    if (existing !== undefined) return existing
    const run = this.run(agent, AbortSignal.any([outer, this.lifetime.signal]))
    this.active.set(agent, run)
    void run.finally(() => { this.active.delete(agent) }).catch((error: unknown) => {
      this.ctx.logger.debug('checklist synchronization stopped: %s', error)
    })
    return run
  }
  private async run(agent: Agent, signal: AbortSignal): Promise<void> {
    let state = this.ctx.longTermProgress.get(agent)
    const binding = state?.vault
    if (state === null || binding == null || binding.writeback !== 'confirmed') return
    let target: FsTarget | undefined
    try {
      let file = await this.read(agent, binding.path, signal)
      target = file.target
      if (target.targetKey !== binding.targetKey) throw new ProgressError('confirmed checklist target identity changed; relink required')
      this.current(agent, state.revision, signal)
      if (file.fingerprint !== binding.fingerprint) {
        const inspection = inspectChecklist(file.text, binding)
        const questions = this.ctx.get('userQuestions')
        if (questions === undefined) throw new ProgressError('external checklist changes require user interaction')
        const conflicts = inspection.entries.map((entry) => {
          const mapping = binding.mapping.find(m => m.marker === entry.marker)
          const checkpoint = state?.milestones.flatMap(m => m.checkpoints).find(c => c.id === mapping?.checkpointId)
          if (checkpoint === undefined) throw new ProgressError('checklist mapping no longer names a checkpoint')
          return { entry, checkpoint }
        })
        const answer = await questions.ask({ agent, signal, questions: conflicts.map(({ entry, checkpoint }) => ({
          id: entry.marker, question: `External checklist change: ${checkpoint.id}. Which value should be preserved?`,
          detail: JSON.stringify({ path: target?.displayPath, fingerprint: file.fingerprint,
            checklist: { checked: entry.checked, text: entry.text },
            session: { checked: checkpoint.complete, outcome: checkpoint.outcome, detail: checkpoint.detail },
            textSynchronization: binding.allowTextRefinement }, null, 2),
          options: [{ label: 'Keep Session' }, { label: 'Keep checklist' }, { label: 'Cancel' }],
        })) })
        this.current(agent, state.revision, signal)
        const reread = await this.read(agent, binding.path, signal)
        if (reread.target.targetKey !== target.targetKey || reread.fingerprint !== file.fingerprint)
          throw new ProgressError('checklist changed after confirmation')
        for (const { entry, checkpoint } of conflicts) {
          const choice = answer.answers.find(a => a.id === entry.marker)
          if (choice?.selected.length !== 1 || choice.custom
            || !['Keep Session', 'Keep checklist'].includes(choice.selected[0] ?? ''))
            throw new ProgressError('external checklist change not confirmed')
          if (choice.selected[0] === 'Keep checklist') {
            if (binding.allowTextRefinement) {
              const prefix = `${checkpoint.outcome} — `
              if (entry.text !== checkpoint.outcome && !entry.text.startsWith(prefix))
                throw new ProgressError('external outcome change requires a confirmed structural draft before synchronization')
              const detail = entry.text === checkpoint.outcome ? '' : entry.text.slice(prefix.length)
              if (detail !== checkpoint.detail) state = this.ctx.longTermProgress.change(agent, state, { kind: 'refine',
                checkpointId: checkpoint.id, detail, references: checkpoint.references,
                reason: `Human selected checklist implementation detail from ${binding.path}` }, { kind: 'maintenance' })
            }
            if (entry.checked !== checkpoint.complete) state = this.ctx.longTermProgress.change(agent, state, { kind: 'reconcile',
              checkpointId: checkpoint.id, evidence: { kind: entry.checked ? 'passed' : 'failed',
                summary: 'Human verified and selected the external checklist completion value.',
                references: [`${binding.path}#${entry.marker}`, `sha256:${file.fingerprint}`] } }, { kind: 'maintenance' })
          }
        }
        file = reread
      }
      const plan = planChecklistWrite(file.text, state, binding)
      if (plan.changed) {
        state = this.ctx.longTermProgress.change(agent, state, { kind: 'vault-settle', fingerprint: binding.fingerprint,
          settlement: 'pending', message: 'Checklist write pending.' }, { kind: 'maintenance' })
        const policy = this.ctx.get('sandboxPolicy')
        if (file.fs.sandboxMode !== undefined && policy === undefined) throw new ProgressError('sandboxed checklist writes require sandboxPolicy')
        await file.fs.writeText(target, plan.text, { kind: 'replaceIfVersion', version: file.version }, signal,
          policy?.resolve({ session: agent.session }))
        this.current(agent, state.revision, signal)
      }
      this.current(agent, state.revision, signal)
      if (binding.settlement !== 'synchronized' || plan.changed || file.fingerprint !== binding.fingerprint)
        this.ctx.longTermProgress.change(agent, state, { kind: 'vault-settle', fingerprint: fingerprint(plan.text),
          settlement: 'synchronized', message: '' }, { kind: 'maintenance' })
    } catch (error) {
      signal.throwIfAborted()
      if (this.ctx.agents.get(agent.id) !== agent) throw error
      const latest = this.ctx.longTermProgress.get(agent)
      if (latest?.revision !== state.revision || latest.vault?.path !== binding.path
        || latest.vault.targetKey !== binding.targetKey || latest.vault.fingerprint !== binding.fingerprint) throw error
      this.ctx.longTermProgress.change(agent, latest, { kind: 'vault-settle', fingerprint: binding.fingerprint,
        settlement: error instanceof ProgressError || (error instanceof FsError && error.code === 'FS_STALE_VERSION') ? 'conflict' : 'failed',
        message: `${target?.displayPath ?? binding.path}: ${error instanceof Error ? error.message : String(error)}. Retry after reviewing both stores.` }, { kind: 'maintenance' })
    }
  }
}
