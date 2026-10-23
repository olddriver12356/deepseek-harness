import { describe, expect, it, vi } from 'vitest'
import type { RemoteInvocation } from '@deepseek-ai/dsh-typert-protocol'
import { harness, milestones } from './consumer-harness.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface PrincipalMap {
    /** Non-owner caller used only by progress authority tests. */
    'progress-test-peer': { readonly kind: 'progress-test-peer' }
  }
}
async function ownerContext(kind: 'owner' | 'peer') {
  const h = await harness()
  const invocation: RemoteInvocation = {
    request: { namespace: 'longTermProgress', method: 'update', args: {} }, service: 'longTermProgress',
    peer: { id: 'test-ui' as RemoteInvocation['peer']['id'], principal: kind === 'owner'
      ? { kind: 'owner' } : { kind: 'progress-test-peer' }, ctx: h.ctx, signal: new AbortController().signal,
    interactions: 'none', dispose: async () => {} },
    signal: new AbortController().signal, uplink: async function* () {},
  }
  return { ...h, ctx: h.ctx.extend({ invocation }) }
}

describe('progress owner UI authority', () => {
  it('rejects a same-process or model call without a live owner invocation', async () => {
    const h = await harness()
    expect(() => h.ctx.longTermProgress.updateFromOwner(h.agent, { revision: 0 }, { kind: 'replace', milestones })).toThrow(/owner/)
    expect(h.session.seq).toBe(0)
  })
  it('rejects a peer even when it can address the Session', async () => {
    const h = await ownerContext('peer')
    expect(() => h.ctx.longTermProgress.updateFromOwner(h.agent, { revision: 0 }, { kind: 'replace', milestones })).toThrow(/owner/)
    expect(h.session.seq).toBe(0)
  })
  it('commits an owner draft and separate approval and start; stale clicks cannot mutate', async () => {
    const h = await ownerContext('owner')
    const send = vi.spyOn(h.agent, 'send')
    const wake = vi.spyOn(h.agent, 'wake')
    const followup = vi.spyOn(h.agent, 'followup')
    h.ctx.longTermProgress.updateFromOwner(h.agent, { revision: 0 }, { kind: 'replace', milestones })
    h.ctx.longTermProgress.updateFromOwner(h.agent, { revision: 1 }, { kind: 'approve', milestoneId: milestones[0]!.id })
    expect(h.ctx.longTermProgress.get(h.agent)?.release).toBeNull()
    expect(() => h.ctx.longTermProgress.updateFromOwner(h.agent, { revision: 1 }, { kind: 'start', milestoneId: milestones[0]!.id })).toThrow(/stale/)
    h.ctx.longTermProgress.updateFromOwner(h.agent, { revision: 2 }, { kind: 'start', milestoneId: milestones[0]!.id })
    expect(h.ctx.longTermProgress.get(h.agent)?.release?.milestoneId).toBe(milestones[0]!.id)
    expect(send).not.toHaveBeenCalled()
    expect(wake).not.toHaveBeenCalled()
    expect(followup).not.toHaveBeenCalled()
  })
})
