/** Deterministic milestone boundary used by both public SDK projection checks. */
export const name = 'sdk-progress-fixture'
export const inject = ['agents', 'longTermProgress']

/** Seed a released milestone, then record observed completion inside the admitted run. */
export function apply(ctx) {
  const seeded = new WeakSet()
  ctx.on('agent/created', ({ agent }) => {
    if (agent.session.header.parentSession !== undefined) return
    const milestones = [{ id: 'm1', title: 'Foundation', caption: 'Durable state', exitCondition: 'Human verification', references: [],
      checkpoints: [{ id: 'c1', outcome: 'Pass focused checks', detail: '', references: ['test-run'] }] },
    { id: 'm2', title: 'Delivery', caption: 'Ship verified work', exitCondition: 'Explicit release', references: [],
      checkpoints: [{ id: 'c2', outcome: 'Deliver', detail: '', references: [] }] }]
    const authority = { kind: 'human', source: 'command' }
    ctx.longTermProgress.change(agent, { revision: 0 }, { kind: 'replace', milestones }, authority)
    ctx.longTermProgress.change(agent, { revision: 1 }, { kind: 'approve', milestoneId: 'm1' }, authority)
    ctx.longTermProgress.change(agent, { revision: 2 }, { kind: 'start', milestoneId: 'm1' }, authority)
    seeded.add(agent)
  })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || !seeded.delete(agent)) return decision
    ctx.longTermProgress.change(agent, { revision: 3 }, { kind: 'reconcile', checkpointId: 'c1',
      evidence: { kind: 'passed', summary: 'Fixture observed the focused checks passing.', references: ['test-run'] } }, { kind: 'maintenance' })
    let refused = false
    try {
      ctx.longTermProgress.change(agent, { revision: 4 }, { kind: 'start', milestoneId: 'm2' }, { kind: 'human', source: 'command' })
    } catch (error) {
      refused = error instanceof Error && /current milestone/.test(error.message)
    }
    if (!refused) throw new Error('completed milestone bypassed human verification')
    return decision
  })
}
