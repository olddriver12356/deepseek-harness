import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { applyDiscussionOperation } from '../src/state.ts'
import type { ConnectionId, CollaborationRequestId } from '../src/types.ts'
import { createCollaborationHarness, type CollaborationHarness } from './helpers/harness.ts'

const opened: CollaborationHarness[] = []
afterEach(async () => { while (opened.length) await opened.pop()!.dispose() })
const connectionId = brandString<ConnectionId>('final-pair')
const sendRequest = (id = 'first') => ({ connectionId, text: id, requestId: brandString<CollaborationRequestId>(id) })

async function setup(cold = false) {
  const h = await createCollaborationHarness({ withDiscussionTools: true, peerDiscussionTools: ['read', 'peer_send', 'collaboration_status'] })
  opened.push(h)
  const recipient = SessionId('final-peer')
  const peer = cold ? undefined : await h.ctx.agents.create({ sessionId: recipient,
    meta: { cwd: h.agent.session.header.cwd! }, agentOptions: { provider: 'mock', model: 'mock' } })
  const state = h.ctx.collaborationStore.read()
  await h.ctx.collaborationStore.transact(state.revision, current => applyDiscussionOperation(current, {
    kind: 'add-peer', registrations: [
      { sessionId: h.agent.id, title: 'Sender', cwd: h.agent.session.header.cwd! },
      { sessionId: recipient, title: 'Recipient', cwd: h.agent.session.header.cwd! },
    ],
    connection: { id: connectionId, sessions: [h.agent.id, recipient], disclosureAccepted: true,
      grants: { snapshot: true, follow: true }, paused: false, budget: { limit: 2, used: 0 } },
  }, { actor: { kind: 'human', sessionId: h.agent.id }, admission: h.admitUiDiscussion(), timestamp: new Date().toISOString() }))
  const control = async (paused: boolean) => {
    const request = { sessionId: h.agent.id, connectionId, expectedRevision: h.ctx.collaborationStore.read().revision,
      requestId: brandString<CollaborationRequestId>(paused ? 'pause' : 'resume') }
    await (paused ? h.ctx.collaborationRemote.pause(request) : h.ctx.collaborationRemote.resume(request))
  }
  return { h, peer, recipient, control }
}

it('fails closed native and alternate execution after unload during a protected response, then permits remount and human work', async () => {
  const { h, peer } = await setup()
  const target = peer!.agent
  const gate = h.holdModelToolCall('write', { file_path: 'unload-native.txt' })
  try {
    await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
    await gate.started
    await h.unloadCollaboration()
    const alternate = await h.ctx.tools.execute({ agent: target, name: 'write', arguments: { file_path: 'unload-alternate.txt' },
      callId: ToolCallId('alternate-unload'), signal: new AbortController().signal })
    expect(alternate.isError).toBe(true)
    gate.release()
    await target.whenIdle()
    expect(h.executed).not.toContain('write')
    expect(await h.workspaceFileExists('unload-native.txt')).toBe(false)
    expect(await h.workspaceFileExists('unload-alternate.txt')).toBe(false)
    target.followup(createUserMessage({ content: [{ type: 'text', text: 'ordinary human after unload' }], source: { kind: 'user' } }))
    await target.whenIdle()
    h.scriptModelToolCall('write', { file_path: 'later-human.txt' })
    target.followup(createUserMessage({ content: [{ type: 'text', text: 'human' }], source: { kind: 'user' } }))
    await target.whenIdle()
    expect(await h.workspaceFileExists('later-human.txt')).toBe(true)
    await h.remountCollaboration()
    expect(h.ctx.get('collaborationMailbox')).toBeDefined()
    h.scriptModelToolCall('write', { file_path: 'remount-peer.txt' })
    await h.ctx.collaborationMailbox.send(h.agent, sendRequest('second'))
    await h.ctx.collaborationMailbox.whenSettled()
    await target.whenIdle()
    expect(await h.workspaceFileExists('remount-peer.txt')).toBe(false)
    h.scriptModelToolCall('write', { file_path: 'remount-human.txt' })
    target.followup(createUserMessage({ content: [{ type: 'text', text: 'human again' }], source: { kind: 'user' } }))
    await target.whenIdle()
    expect(await h.workspaceFileExists('remount-human.txt')).toBe(true)
  } finally { gate.release() }
})

it.each(['pre-step', 'request', 'prepare-call'] as const)('retains exact claimed input across pause during %s, resumes once with human and peer FIFO', async (window) => {
  const { h, peer, control } = await setup()
  const target = peer!.agent
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  let held = false
  if (window === 'prepare-call') {
    const prepare = h.ctx.llm.prepareCall.bind(h.ctx.llm)
    vi.spyOn(h.ctx.llm, 'prepareCall').mockImplementation(async (...args) => {
      const result = await prepare(...args)
      if (!held) { held = true; entered.resolve(undefined); await release.promise }
      return result
    })
  } else if (window === 'pre-step') h.ctx.on('agent/pre-step', async ({ agent }, next) => {
    const result = await next()
    if (agent === target && !held) { held = true; entered.resolve(undefined); await release.promise }
    return result
  })
  else h.ctx.on('agent/request', async ({ agent }, next) => {
    const result = await next()
    if (agent === target && !held) { held = true; entered.resolve(undefined); await release.promise }
    return result
  })
  const inserted: string[] = []
  const discarded: string[] = []
  h.ctx.on('agent/inbox/inserted', ({ agent, message }) => { if (agent === target) inserted.push(message.id) })
  h.ctx.on('agent/inbox/discarded', ({ agent, message }) => { if (agent === target) discarded.push(message.id) })
  try {
    const receipt = await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
    await entered.promise
    const original = h.ctx.sessionProjections.stateOf(target.session, 'collaborationReceipts')!.receipts[0]!
    await h.ctx.collaborationMailbox.send(h.agent, sendRequest('second'))
    await control(true)
    for (const text of ['human one', 'human two']) target.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    release.resolve(undefined)
    await target.whenIdle()
    await h.ctx.collaborationMailbox.whenSettled()
    expect(h.requests).toHaveLength(2)
    expect(target.inbox.nextTurn.map(message => message.id)).toEqual([original.inputId])
    expect(h.ctx.sessionProjections.stateOf(target.session, 'collaborationReceipts')!.receipts[0]).toMatchObject({
      messageId: receipt.messageId, inputId: original.inputId, phase: 'pending',
    })
    expect(inserted.filter(id => id === original.inputId)).toHaveLength(1)
    expect(discarded).toEqual([])
    await control(false)
    await h.ctx.collaborationMailbox.whenSettled()
    await target.whenIdle()
    await h.ctx.collaborationMailbox.whenSettled()
    await target.whenIdle()
    const inputs = target.session.deriveMessages().filter(message => message.role === 'user')
    expect(inputs.map(message => message.source.kind)).toEqual(['user', 'user', 'collaboration-peer', 'collaboration-peer'])
    expect(inputs[2]?.id).toBe(original.inputId)
    expect(inputs[2]?.source).toMatchObject({ messageId: receipt.messageId })
    expect(h.requests).toHaveLength(4)
    expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(2)
    expect(h.ctx.collaborationStore.read().outbox.map(row => row.state)).toEqual(['admitted', 'admitted'])
    expect(h.ctx.sessionProjections.stateOf(target.session, 'collaborationReceipts')!.receipts.map(row => row.phase)).toEqual(['consumed', 'consumed'])
    expect(inserted.filter(id => id === original.inputId)).toHaveLength(1)
  } finally { release.resolve(undefined) }
})

it('publishes permanent cold resolution failure to the human view and model status with a stable receipt and zero charge', async () => {
  const { h, recipient } = await setup(true)
  await h.deliverHumanTurn('status')
  const original = await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
  await h.ctx.collaborationMailbox.whenSettled()
  const view = await h.ctx.collaborationRemote.controlSnapshot({ sessionId: h.agent.id })
  expect(view.outbox[0]).toMatchObject({ id: original.messageId, state: 'failed', deliveryReason: 'recipient-missing' })
  const status = await h.executeCurrentTool('collaboration_status', {})
  expect(status.accepted).toBe(true)
  expect(status.result.content).toEqual([{ type: 'text', text: expect.stringContaining('"deliveryReason":"recipient-missing"') as string }])
  const block = status.result.content[0]
  if (block?.type !== 'text') throw new Error('expected actual model status text')
  const modelMessage = (JSON.parse(block.text) as { messages: object[] }).messages[0]
  expect(modelMessage).toMatchSnapshot({ id: expect.any(String) as string }, 'cold recipient resolution failure')
  const revision = h.ctx.collaborationStore.read().revision
  expect(await h.ctx.collaborationMailbox.send(h.agent, sendRequest())).toEqual(original)
  await h.ctx.collaborationMailbox.whenSettled()
  expect(h.ctx.collaborationStore.read().revision).toBe(revision)
  expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(0)
  expect(h.ctx.agents.get(recipient)).toBeUndefined()
})

it('settles an admitted but permanently refused input truthfully after revocation during pre-step', async () => {
  const { h, peer } = await setup()
  const target = peer!.agent
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  h.ctx.on('agent/pre-step', async ({ agent }, next) => {
    const result = await next()
    if (agent === target) { entered.resolve(undefined); await release.promise }
    return result
  })
  try {
    const original = await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
    await entered.promise
    await h.ctx.collaborationRemote.removePeer({ sessionId: h.agent.id, connectionId,
      expectedRevision: h.ctx.collaborationStore.read().revision, requestId: brandString<CollaborationRequestId>('disconnect') })
    release.resolve(undefined)
    await target.whenIdle()
    await h.ctx.collaborationMailbox.whenSettled()
    expect(h.requests).toHaveLength(0)
    expect(h.ctx.collaborationStore.read().outbox[0]).toMatchObject({ id: original.messageId,
      state: 'failed', deliveryReason: 'input-refused', activationReserved: true })
    expect(h.ctx.sessionProjections.stateOf(target.session, 'collaborationReceipts')!.receipts[0]?.phase).toBe('refused')
  } finally { release.resolve(undefined) }
})

it('treats the ordinary resolver subagent-ownership result as terminal without reading its error text', async () => {
  const { h, recipient } = await setup(true)
  vi.spyOn(h.ctx.sessionController, 'resolveAgent').mockResolvedValue({ error: new RemoteError('session/agent-busy', 'PRIVATE', { reason: 'PRIVATE' }) })
  await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
  await h.ctx.collaborationMailbox.whenSettled()
  expect((await h.ctx.collaborationRemote.controlSnapshot({ sessionId: h.agent.id })).outbox[0]).toMatchObject({
    state: 'failed', deliveryReason: 'recipient-not-ordinary',
  })
  expect(h.ctx.agents.get(recipient)).toBeUndefined()
  expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(0)
})

it('keeps thrown unknown resolver errors retryable and exposes only the bounded reason', async () => {
  const { h, recipient } = await setup(true)
  vi.spyOn(h.ctx.sessionController, 'resolveAgent').mockRejectedValue(new Error('PRIVATE '.repeat(10000)))
  await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
  await h.ctx.collaborationMailbox.whenSettled()
  const view = await h.ctx.collaborationRemote.controlSnapshot({ sessionId: h.agent.id })
  expect(view.outbox[0]).toMatchObject({ state: 'queued', deliveryReason: 'recipient-unavailable' })
  expect(JSON.stringify(view)).not.toContain('PRIVATE')
  expect(h.ctx.agents.get(recipient)).toBeUndefined()
})

it('preserves admitted history during recovery failure and clears its visible diagnostic on successful resolution', async () => {
  const { h, peer, recipient } = await setup()
  await h.deliverHumanTurn('status')
  const original = await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
  await h.ctx.collaborationMailbox.whenSettled()
  await peer!.agent.whenIdle()
  await h.ctx.collaborationMailbox.whenSettled()
  await peer!.dispose()
  const resolver = vi.spyOn(h.ctx.sessionController, 'resolveAgent').mockResolvedValue({ error: new RemoteError('gateway/internal', 'PRIVATE', {}) })
  h.ctx.collaborationMailbox.recover()
  await h.ctx.collaborationMailbox.whenSettled()
  expect((await h.ctx.collaborationRemote.controlSnapshot({ sessionId: h.agent.id })).outbox[0]).toMatchObject({
    id: original.messageId, state: 'admitted', activationReserved: true, deliveryReason: 'recipient-unavailable',
  })
  expect(JSON.stringify((await h.executeCurrentTool('collaboration_status', {})).result.content)).toContain('recipient-unavailable')
  resolver.mockRestore()
  h.ctx.collaborationMailbox.recover()
  await h.ctx.collaborationMailbox.whenSettled()
  await h.ctx.agents.get(recipient)!.whenIdle()
  expect((await h.ctx.collaborationRemote.controlSnapshot({ sessionId: h.agent.id })).outbox[0]).toMatchObject({
    id: original.messageId, state: 'admitted', activationReserved: true,
  })
  expect(h.ctx.collaborationStore.read().outbox[0]).not.toHaveProperty('deliveryReason')
  expect(JSON.stringify((await h.executeCurrentTool('collaboration_status', {})).result.content)).not.toContain('recipient-unavailable')
  expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
  expect(h.requests).toHaveLength(2)
})

it('reconstructs a durably restored paused claim and resumes the same identity with one reserved activation', async () => {
  const { h, peer, recipient, control } = await setup()
  const target = peer!.agent
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const listener = h.ctx.on('agent/pre-step', async ({ agent }, next) => {
    const result = await next()
    if (agent === target) { entered.resolve(undefined); await release.promise }
    return result
  })
  try {
    const original = await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
    await entered.promise
    const inputId = h.ctx.sessionProjections.stateOf(target.session, 'collaborationReceipts')!.receipts[0]!.inputId
    await control(true)
    release.resolve(undefined)
    await target.whenIdle()
    await h.ctx.collaborationMailbox.whenSettled()
    listener()
    target.cancel({ kind: 'user' }, { keepInbox: true })
    await h.ctx.sessionPersistence.flush()
    const handle = await h.ctx.sessionPersistence.open(recipient, 'read')
    try {
      const stored = await handle.read()
      const restored = Session.fromRestore(recipient, stored.events, handle.header, handle.inheritedEventCount, stored.eventState)
      expect(h.ctx.sessionProjections.stateOf(restored, 'inbox')?.['next-turn'][0]?.id).toBe(inputId)
      expect(h.ctx.sessionProjections.stateOf(restored, 'collaborationReceipts')?.receipts[0]).toMatchObject({
        messageId: original.messageId, inputId, phase: 'pending',
      })
    } finally { await handle.close() }
    await control(false)
    await h.ctx.collaborationMailbox.whenSettled()
    await target.whenIdle()
    expect(target.session.deriveMessages().filter(message => message.source.kind === 'collaboration-peer')).toMatchObject([{ id: inputId,
      source: { messageId: original.messageId } }])
    expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
    expect(h.requests).toHaveLength(1)
  } finally { release.resolve(undefined); listener() }
})

it('shows sanitized retryable resolution failure without repeated journal writes, then retries the same identity and charge', async () => {
  const { h, peer, recipient } = await setup()
  const warnings = vi.spyOn(h.ctx.logger, 'warn')
  await h.deliverHumanTurn('status')
  peer!.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'materialize peer history' }], source: { kind: 'user' } }))
  await peer!.agent.whenIdle()
  await peer!.dispose()
  const resolver = h.ctx.sessionController
  const resolve = vi.spyOn(resolver, 'resolveAgent').mockResolvedValue({ error: new RemoteError('gateway/internal', 'SECRET '.repeat(1000), {}) })
  const original = await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
  await h.ctx.collaborationMailbox.whenSettled()
  expect((await h.ctx.collaborationRemote.controlSnapshot({ sessionId: h.agent.id })).outbox[0]).toMatchObject({
    id: original.messageId, state: 'queued', deliveryReason: 'recipient-unavailable',
  })
  const revision = h.ctx.collaborationStore.read().revision
  expect(await h.ctx.collaborationMailbox.send(h.agent, sendRequest())).toEqual(original)
  await h.ctx.collaborationMailbox.whenSettled()
  expect(h.ctx.collaborationStore.read().revision).toBe(revision)
  expect(JSON.stringify((await h.executeCurrentTool('collaboration_status', {})).result.content)).not.toContain('SECRET')
  resolve.mockRestore()
  await h.ctx.collaborationMailbox.send(h.agent, sendRequest())
  await h.ctx.collaborationMailbox.whenSettled()
  await h.ctx.agents.get(recipient)!.whenIdle()
  await h.ctx.collaborationMailbox.whenSettled()
  await h.ctx.agents.get(recipient)!.whenIdle()
  expect(warnings.mock.calls).toEqual([])
  expect(h.ctx.collaborationStore.read().outbox[0]).toMatchObject({ id: original.messageId, state: 'admitted' })
  expect(h.ctx.collaborationStore.read().outbox[0]).not.toHaveProperty('deliveryReason')
  expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
})
