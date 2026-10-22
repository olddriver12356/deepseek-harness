import { describe, expect, it } from 'vitest'
import { transition, currentMilestone, eligibleCheckpoints, milestoneId, checkpointId, defaultLimits } from '../src/domain.ts'
import type { ProgressChange, ProgressView } from '../src/types.ts'
const m1 = milestoneId('m1'), m2 = milestoneId('m2'), c1 = checkpointId('c1'), c2 = checkpointId('c2')
export const draft = [
  { id: m1, title: 'First', caption: 'First caption', exitCondition: 'Tests pass', references: [], checkpoints: [
    { id: c1, outcome: 'First outcome', detail: 'Implementation', references: [] },
    { id: c2, outcome: 'Second outcome', detail: '', references: [] },
  ] },
  { id: m2, title: 'Second', caption: 'Second caption', exitCondition: 'Accepted', references: [], checkpoints: [] },
]
const human = { kind: 'human', source: 'command' } as const
const model = { kind: 'maintenance' } as const
function step(view: ProgressView | null, change: ProgressChange, authority = human): ProgressView {
  return transition(view, { revision: view?.revision ?? 0 }, change, authority, defaultLimits)
}
function initial() { return step(null, { kind: 'replace', milestones: draft }) }
describe('progress domain', () => {
  it('has no current milestone in an empty list', () => {
    expect(currentMilestone(step(null, { kind: 'replace', milestones: [] }))).toBeNull()
  })
  it('retains stable identities and rejects duplicate IDs and a third level', () => {
    expect(initial().milestones[0]?.checkpoints[0]?.id).toBe(c1)
    expect(() => step(null, { kind: 'replace', milestones: [...draft, draft[0]!] })).toThrow(/unique/)
    expect(() => transition(null,
      { revision: 0 },
      JSON.parse(JSON.stringify({ kind: 'replace',
        milestones: [{ ...draft[0],
          children: [] }] })),
      human,
      defaultLimits)).toThrow()
  })
  it('rejects stale revisions before changes', () => {
    expect(() => transition(initial(), { revision: 0 }, { kind: 'replace', milestones: [] }, human, defaultLimits)).toThrow(/stale/)
  })
  it('requires human approval and separate release without executing anything', () => {
    const state = initial()
    expect(() => step(state, { kind: 'start', milestoneId: m1 })).toThrow(/approved/)
    expect(() => transition(state,
      { revision: state.revision },
      { kind: 'approve',
        milestoneId: m1 },
      model,
      defaultLimits)).toThrow(/human/)
    const approved = step(state, { kind: 'approve', milestoneId: m1 })
    expect(approved.release).toBeNull()
    expect(eligibleCheckpoints(approved, m1, [c1])).toBe(false)
    const released = step(approved, { kind: 'start', milestoneId: m1 })
    expect(eligibleCheckpoints(released, m1, [c1, c2])).toBe(true)
    expect(eligibleCheckpoints(released, m1, [c2])).toBe(false)
    expect(eligibleCheckpoints(released, m2, [])).toBe(false)
  })
  it('requires checkpoint evidence and acceptance does not release the next milestone', () => {
    let state = step(step(initial(), { kind: 'approve', milestoneId: m1 }), { kind: 'start', milestoneId: m1 })
    expect(() => step(state, { kind: 'accept', milestoneId: m1 })).toThrow(/evidence/)
    for (const id of [c1, c2])
      state = step(state,
        { kind: 'reconcile',
          checkpointId: id,
          evidence: { kind: 'passed',
            summary: 'Observed passing tests',
            references: ['test run'] } })
    expect(state.acceptances).toEqual([])
    state = step(state, { kind: 'accept', milestoneId: m1 })
    expect(currentMilestone(state)?.id).toBe(m2)
    expect(state.release).toBeNull()
    expect(state.acceptances).toHaveLength(1)
  })
  it('structural replacement revokes release and refinements cannot change outcomes', () => {
    let state = step(step(initial(), { kind: 'approve', milestoneId: m1 }), { kind: 'start', milestoneId: m1 })
    state = step(state, {
      kind: 'refine', checkpointId: c1, detail: 'More precise implementation', references: [],
      reason: 'Clarify the approved implementation approach',
    })
    expect(state.milestones[0]?.checkpoints[0]?.outcome).toBe('First outcome')
    expect(state.release).not.toBeNull()
    state = step(state, { kind: 'replace', milestones: draft })
    expect(state.release).toBeNull()
    expect(state.approvals).toEqual([])
  })
  it('requires a concrete refinement reason before accepting implementation edits', () => {
    const state = step(initial(), { kind: 'approve', milestoneId: m1 })
    for (const reason of [undefined, '', '  ']) {
      expect(() => transition(state, { revision: state.revision }, {
        kind: 'refine', checkpointId: c1, detail: 'Implementation details', references: [],
        ...reason === undefined ? {} : { reason },
      }, model, defaultLimits)).toThrow()
    }
    expect(transition(state, { revision: state.revision }, {
      kind: 'refine', checkpointId: c1, detail: 'Implementation details', references: [],
      reason: 'Clarify the approved implementation approach',
    }, model, defaultLimits).milestones[0]?.checkpoints[0]?.detail).toBe('Implementation details')
  })
  it('retains historical approval evidence for accepted milestones after structural replacement', () => {
    let state = step(initial(), { kind: 'approve', milestoneId: m1 })
    for (const id of [c1, c2]) state = step(state, {
      kind: 'reconcile', checkpointId: id,
      evidence: { kind: 'passed', summary: 'Observed pass', references: ['run'] },
    })
    state = step(state, { kind: 'accept', milestoneId: m1 })
    const replaced = step(state, { kind: 'replace', milestones: draft })
    expect(replaced.acceptances).toEqual([{ milestoneId: m1, revision: 5 }])
    expect(replaced.approvals).toEqual([{ milestoneId: m1, revision: 2 }])
    expect(replaced.release).toBeNull()
    expect(() => step(replaced, { kind: 'start', milestoneId: m2 })).toThrow(/approved/)
  })
  it('preserves matching checkpoint evidence across structural edits', () => {
    let state = initial()
    state = step(state,
      { kind: 'reconcile',
        checkpointId: c1,
        evidence: { kind: 'passed',
          summary: 'Observed pass',
          references: ['run'] } })
    state = step(state, { kind: 'replace', milestones: draft.map(m => ({ ...m, caption: `${m.caption} updated` })) })
    expect(state.milestones[0]?.checkpoints[0]?.evidence).toHaveLength(1)
    expect(state.milestones[0]?.checkpoints[0]?.complete).toBe(true)
  })
  it('preserves global checkpoint evidence when moving it between milestones', () => {
    const state = step(initial(), {
      kind: 'reconcile', checkpointId: c1,
      evidence: { kind: 'passed', summary: 'Observed pass', references: ['run'] },
    })
    const moved = draft.map(m => ({
      ...m,
      checkpoints: m.id === m1 ? m.checkpoints.filter(c => c.id !== c1) : [draft[0]!.checkpoints[0]!],
    }))
    const result = step(state, { kind: 'replace', milestones: moved })
    expect(result.milestones[1]?.checkpoints[0]).toMatchObject({
      id: c1, complete: true,
      evidence: [{ kind: 'passed', summary: 'Observed pass', references: ['run'], revision: 2 }],
    })
    expect(result.release).toBeNull()
    expect(result.approvals).toEqual([])
  })
  it('rejects changing an evidenced outcome under the same ID across milestone moves', () => {
    const state = step(initial(), {
      kind: 'reconcile', checkpointId: c1,
      evidence: { kind: 'failed', summary: 'Observed failure', references: ['run'] },
    })
    const moved = draft.map(m => ({
      ...m,
      checkpoints: m.id === m1 ? m.checkpoints.filter(c => c.id !== c1)
        : [{ ...draft[0]!.checkpoints[0]!, outcome: 'Different approved outcome' }],
    }))
    expect(() => step(state, { kind: 'replace', milestones: moved })).toThrow(/new checkpoint identity/)
  })
  it('allows historical oversized state to shrink under reduced deployment limits', () => {
    const state = initial()
    const limits = { ...defaultLimits, maxMilestones: 1 }
    expect(() => transition(state, { revision: 1 }, { kind: 'replace', milestones: draft }, human, limits))
      .toThrow(/milestones limit/)
    expect(() => transition(state, { revision: 1 }, { kind: 'references', references: [] }, human, limits))
      .toThrow(/milestones limit/)
    expect(transition(state, { revision: 1 }, { kind: 'replace', milestones: [] }, human, limits))
      .toMatchObject({ revision: 2, milestones: [] })
  })
  it('allows replacing historical oversized text and checkpoint collections with bounded content', () => {
    const state = initial()
    const limits = { ...defaultLimits, maxCheckpoints: 1, maxTextLength: 1 }
    expect(transition(state, { revision: 1 }, {
      kind: 'replace', milestones: [{
        id: m1, title: 'A', caption: 'B', exitCondition: 'C', references: [],
        checkpoints: [{ id: c1, outcome: 'D', detail: '', references: [] }],
      }],
    }, human, limits).milestones[0]?.checkpoints).toHaveLength(1)
  })
  it('bounds content rather than protocol literals or stable identities at tiny text limits', () => {
    const limits = { ...defaultLimits, maxTextLength: 1 }
    expect(transition(null, { revision: 0 }, { kind: 'replace', milestones: [] }, human, limits).milestones)
      .toEqual([])
    const state = transition(null, { revision: 0 }, {
      kind: 'replace', milestones: [{
        id: m1, title: 'A', caption: 'B', exitCondition: 'C', references: ['D'],
        checkpoints: [{ id: c1, outcome: 'E', detail: 'F', references: [] }],
      }],
    }, human, limits)
    const approved = transition(state, { revision: 1 }, { kind: 'approve', milestoneId: m1 }, human, limits)
    expect(transition(approved, { revision: 2 }, { kind: 'start', milestoneId: m1 }, human, limits).release)
      .toEqual({ milestoneId: m1, revision: 3 })
    expect(() => transition(state, { revision: 1 }, { kind: 'references', references: ['AB'] }, human, limits))
      .toThrow(/text limit/)
  })
  it('rejects oversized lists and text rather than dropping captions', () => {
    expect(() => transition(null,
      { revision: 0 },
      { kind: 'replace',
        milestones: draft },
      human,
      { ...defaultLimits,
        maxMilestones: 1 })).toThrow()
    expect(() => transition(null,
      { revision: 0 },
      { kind: 'replace',
        milestones: draft },
      human,
      { ...defaultLimits,
        maxTextLength: 3 })).toThrow()
  })
})
