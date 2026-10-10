import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import { SessionLogOffset } from '@deepseek-ai/dsh-session'
import { applyDiscussionOperation } from '../src/state.ts'
import { framePeerMessage } from '../src/messages.ts'
import type { PeerMessageId } from '../src/types.ts'
import type { CollaborationRequestId, ConnectionId, DiscussionOperation } from '../src/types.ts'
import { createCollaborationHarness, type CollaborationHarness } from './helpers/harness.ts'

const opened: CollaborationHarness[] = []
afterEach(async () => { while (opened.length) await opened.pop()!.dispose() })
const connectionId = brandString<ConnectionId>('pair')
const request = (id = 'r') => ({ connectionId, text: 'hello peer', requestId: brandString<CollaborationRequestId>(id) })

async function setup() {
  const h = await createCollaborationHarness()
  opened.push(h)
  const peer = await h.ctx.agents.create({ sessionId: SessionId('recipient'), meta: { cwd: h.agent.session.header.cwd! }, agentOptions: { provider: 'mock', model: 'mock' } })
  const mutate = async (operation: DiscussionOperation) => {
    const state = h.ctx.collaborationStore.read()
    await h.ctx.collaborationStore.transact(state.revision, current => applyDiscussionOperation(current, operation,
      { actor: { kind: 'human', sessionId: h.agent.id }, admission: h.admitUiDiscussion(), timestamp: new Date().toISOString() }))
  }
  await mutate({ kind: 'add-peer', registrations: [
    { sessionId: h.agent.id, title: 'Sender', cwd: h.agent.session.header.cwd! },
    { sessionId: peer.agent.id, title: 'Recipient', cwd: h.agent.session.header.cwd! },
  ], connection: { id: connectionId, sessions: [h.agent.id, peer.agent.id], disclosureAccepted: true,
    grants: { snapshot: true, follow: true }, paused: false, budget: { limit: 3, used: 0 } } })
  return { h, peer, mutate, box: h.ctx.collaborationMailbox }
}

it('commits attributed acceptance before wake and records actual non-inherited receipt', async () => {
  const { h, peer, box } = await setup()
  const receipt = await box.send(h.agent, request())
  expect(receipt.state).toBe('queued')
  await box.whenSettled()
  await peer.agent.whenIdle()
  expect(h.ctx.collaborationStore.read().outbox[0]?.state).toBe('admitted')
  expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
  expect(peer.agent.session.deriveMessages().find(row => row.source.kind === 'collaboration-peer')?.source).toMatchObject({
    senderSessionId: h.agent.id, recipientSessionId: peer.agent.id, messageId: receipt.messageId,
  })
  expect(h.agent.session.deriveMessages()).toHaveLength(0)
})

it('keeps a running recipient turn separate from peer discussion', async () => {
  const { h, peer, box } = await setup()
  const hold = h.holdModelRequest()
  peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'human' }], source: { kind: 'user' } }))
  await hold.started
  await box.send(h.agent, request())
  await box.whenSettled()
  expect(h.ctx.collaborationStore.read().outbox[0]?.state).toBe('queued')
  expect(peer.agent.inbox.nextTurn).toHaveLength(0)
  peer.agent.cancel({ kind: 'user' })
  await hold.stopped
  await peer.agent.whenIdle()
  await box.whenSettled()
  await peer.agent.whenIdle()
  expect(h.ctx.collaborationStore.read().outbox[0]?.state).toBe('admitted')
})

it('returns the original receipt for concurrent retries and rejects forged sender JSON', async () => {
  const { h, peer, box } = await setup()
  const receipts = await Promise.all([box.send(h.agent, request()), box.send(h.agent, request())])
  expect(receipts[0]).toEqual(receipts[1])
  await box.whenSettled()
  await peer.agent.whenIdle()
  expect(h.ctx.collaborationStore.read().outbox).toHaveLength(1)
  expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
  await expect(box.send(h.agent, { ...request('forge'), sender: 'other' } as never)).rejects.toThrow()
  await expect(box.send(h.agent, { ...request(), text: 'changed' })).rejects.toThrow(/different/)
})

it('refuses an absent pair and a stale Agent identity', async () => {
  const { h, peer, box } = await setup()
  await expect(box.send(h.agent, { ...request(), connectionId: brandString<ConnectionId>('absent') })).rejects.toThrow(/absent/)
  const disposed = peer.agent
  await peer.dispose()
  await expect(box.send(disposed, request())).rejects.toThrow(/live ordinary/)
})

it('rechecks human pending work after activation storage awaits, preserving one charge', async () => {
  const { h, peer, box } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  store.transact = async (...args) => {
    const result = await transact(...args)
    if (result.journal.at(-1)?.operation === 'reserve-activation') { entered.resolve(undefined); await release.promise }
    return result
  }
  try {
    await box.send(h.agent, request())
    await entered.promise
    peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'human priority' }], source: { kind: 'user' } }))
    release.resolve(undefined)
    await box.whenSettled()
    await peer.agent.whenIdle()
    box.recover()
    await box.whenSettled()
    await peer.agent.whenIdle()
    const inputs = peer.agent.session.deriveMessages().filter(row => row.role === 'user')
    expect(inputs.map(row => row.source.kind)).toEqual(['user', 'collaboration-peer'])
    expect(store.read().connections[0]?.budget.used).toBe(1)
  } finally { release.resolve(undefined); store.transact = transact }
})

it('disconnects a reserved queued item before admission without waking it', async () => {
  const { h, peer, box, mutate } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  store.transact = async (...args) => {
    const result = await transact(...args)
    if (result.journal.at(-1)?.operation === 'reserve-activation') { entered.resolve(undefined); await release.promise }
    return result
  }
  try {
    await box.send(h.agent, request())
    await entered.promise
    await mutate({ kind: 'disconnect', connectionId })
    release.resolve(undefined)
    await box.whenSettled()
    expect(store.read().outbox[0]).toMatchObject({ state: 'cancelled', activationReserved: true })
    expect(peer.agent.session.deriveMessages()).toHaveLength(0)
  } finally { release.resolve(undefined); store.transact = transact }
})

it.each(['flush', 'ack'] as const)('keeps human FIFO before the retained peer during the %s await', async (window) => {
  const { h, peer, box } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  const flush = h.ctx.sessionPersistence.flush.bind(h.ctx.sessionPersistence)
  let held = false
  const hold = async () => { held = true; entered.resolve(undefined); await release.promise }
  store.transact = async (...args) => {
    const result = await transact(...args)
    if (window === 'ack' && !held && result.journal.at(-1)?.operation === 'admit') await hold()
    return result
  }
  h.ctx.sessionPersistence.flush = async () => {
    await flush()
    if (window === 'flush' && !held && peer.agent.inbox.nextTurn.some(message => message.source.kind === 'collaboration-peer')) await hold()
  }
  try {
    await box.send(h.agent, request())
    await entered.promise
    for (const text of ['first human', 'second human']) {
      peer.agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    }
    release.resolve(undefined)
    await box.whenSettled()
    await peer.agent.whenIdle()
    const inputs = peer.agent.session.deriveMessages().filter(message => message.role === 'user')
    expect(inputs.map(message => message.source.kind)).toEqual(['user', 'user', 'collaboration-peer'])
    expect(inputs.slice(0, 2).map(message => message.content)).toEqual([
      [{ type: 'text', text: 'first human' }], [{ type: 'text', text: 'second human' }],
    ])
    expect(h.ctx.sessionProjections.stateOf(peer.agent.session, 'collaborationReceipts')?.receipts).toHaveLength(1)
    expect(store.read().connections[0]?.budget.used).toBe(1)
    expect(h.requests).toHaveLength(3)
  } finally {
    release.resolve(undefined)
    store.transact = transact
    h.ctx.sessionPersistence.flush = flush
  }
})

it('rechecks grant after a downstream pre-step await and preserves its series decision', async () => {
  const { h, peer, box, mutate } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  h.ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next()
    if (agent === peer.agent) { entered.resolve(undefined); await release.promise }
    return decision.kind === 'reject' ? decision : { ...decision, startsRequestSeries: true }
  })
  try {
    await box.send(h.agent, request())
    await entered.promise
    await mutate({ kind: 'pause', connectionId, paused: true })
    release.resolve(undefined)
    await peer.agent.whenIdle()
    expect(h.requests).toHaveLength(0)
  } finally { release.resolve(undefined) }
})

it('reconciles a committed recipient receipt after an outbox acknowledgement failure without a duplicate wake', async () => {
  const { h, peer, box } = await setup()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  let failAdmission = true
  store.transact = (revision, transform) => transact(revision, (current) => {
    const next = transform(current)
    if (failAdmission && next.journal.at(-1)?.operation === 'admit') throw new Error('simulated outbox acknowledgement failure')
    return next
  })
  try {
    await box.send(h.agent, request())
    await box.whenSettled()
    await peer.agent.whenIdle()
    expect(store.read().outbox[0]).toMatchObject({ state: 'queued', activationReserved: true })
    const count = h.requests.length
    failAdmission = false
    box.recover()
    await box.whenSettled()
    expect(store.read().outbox[0]?.state).toBe('admitted')
    await peer.agent.whenIdle()
    expect(h.requests).toHaveLength(count + 1)
    expect(store.read().connections[0]?.budget.used).toBe(1)
  } finally { store.transact = transact }
})

it('preserves a downstream request-series declaration on an admitted peer turn', async () => {
  const { h, peer, box } = await setup()
  peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'initialize' }], source: { kind: 'user' } }))
  await peer.agent.whenIdle()
  h.ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    return decision.kind === 'reject' ? decision : { ...decision, startsRequestSeries: true }
  })
  await box.send(h.agent, request())
  await box.whenSettled()
  await peer.agent.whenIdle()
  await h.ctx.sessionPersistence.flush()
  const stored = await h.ctx.sessionPersistence.open(peer.agent.id, 'read')
  try {
    const events = (await stored.read()).events
    expect(events.some(event => event.type === 'request/header' && (event.data.reason === 'series' || event.data.startsSeries === true))).toBe(true)
  } finally { await stored.close() }
})

it('does not inherit a parent receipt or connection authority into an ordinary fork', async () => {
  const { h, peer, box } = await setup()
  await box.send(h.agent, request())
  await box.whenSettled()
  await peer.agent.whenIdle()
  await h.ctx.sessionPersistence.flush()
  const stored = await h.ctx.sessionPersistence.open(peer.agent.id, 'read')
  let events
  try { events = (await stored.read()).events } finally { await stored.close() }
  const fork = await h.ctx.agents.create({ sessionId: SessionId('fork'), meta: { parentSession: peer.agent.id, isSeeded: true },
    seed: events, inheritedEventCount: SessionLogOffset(events.length), agentOptions: { provider: 'mock', model: 'mock' } })
  expect(h.ctx.sessionProjections.stateOf(fork.agent.session, 'collaborationReceipts')?.receipts).toEqual([])
  await expect(box.send(fork.agent, request('fork-request'))).rejects.toThrow(/absent/)
})

it('retains exact own attribution through surface compaction and durable replay', async () => {
  const { h, peer, box } = await setup()
  const accepted = await box.send(h.agent, request())
  await box.whenSettled()
  await peer.agent.whenIdle()
  await h.ctx.sessionPersistence.flush()
  const stored = await h.ctx.sessionPersistence.open(peer.agent.id, 'read')
  let original
  try { original = (await stored.read()).events.find(event => event.type === 'user/message' && event.data.source.kind === 'collaboration-peer') }
  finally { await stored.close() }
  if (original === undefined) throw new Error('missing peer input')
  const off = h.ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (agent === peer.agent) agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'compacted discussion' }], source: { kind: 'compaction-fixture' },
    }), { surfaceOp: { op: 'replace', startSeq: original.seq, endSeq: original.seq }, sourceEventSeqs: [original.seq] })
    return next()
  })
  try {
    peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'continue human' }], source: { kind: 'user' } }))
    await peer.agent.whenIdle()
  } finally { off() }
  const id = peer.agent.id
  await peer.dispose()
  const resumed = await h.ctx.agents.resume({ resumeSessionId: id, agentOptions: { provider: 'mock', model: 'mock' } })
  try {
    const receipts = h.ctx.sessionProjections.stateOf(resumed.agent.session, 'collaborationReceipts')?.receipts
    expect(receipts).toHaveLength(1)
    expect(receipts?.[0]).toMatchObject({ messageId: accepted.messageId, senderSessionId: h.agent.id, recipientSessionId: id })
    expect(resumed.agent.session.deriveMessages().some(message => message.source.kind === 'collaboration-peer')).toBe(false)
    const replayed = await h.ctx.sessionPersistence.open(id, 'read')
    try { expect((await replayed.read()).events.find(event => event.seq === original.seq)).toEqual(original) }
    finally { await replayed.close() }
    box.recover()
    await box.whenSettled()
    expect(h.requests).toHaveLength(2)
    expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
  } finally { await resumed.dispose() }
})

it('leaves a cancelled maintenance reservation queued and refuses new sends after disposal', async () => {
  const { h, peer, box } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  store.transact = async (...args) => {
    const result = await transact(...args)
    if (result.journal.at(-1)?.operation === 'reserve-activation') { entered.resolve(undefined); await release.promise }
    return result
  }
  try {
    await box.send(h.agent, request())
    await entered.promise
    peer.agent.cancel({ kind: 'user' })
    const closing = box.close()
    release.resolve(undefined)
    await closing
    expect(store.read().outbox[0]).toMatchObject({ state: 'queued', activationReserved: true })
    expect(peer.agent.inbox.nextTurn).toHaveLength(0)
    await expect(box.send(h.agent, request('closed'))).rejects.toThrow(/disposed/)
  } finally { release.resolve(undefined); store.transact = transact }
})

it('resolves a cold ordinary Session through the production resolver and admits its exact receipt', async () => {
  const { h, peer, box } = await setup()
  const id = peer.agent.id
  peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'initialize' }], source: { kind: 'user' } }))
  await peer.agent.whenIdle()
  await peer.dispose()
  expect(h.ctx.agents.get(id)).toBeUndefined()
  await box.send(h.agent, request())
  await box.whenSettled()
  const resumed = h.ctx.agents.get(id)
  expect(resumed).toBeDefined()
  await resumed!.whenIdle()
  expect(h.ctx.collaborationStore.read().outbox[0]?.state).toBe('admitted')
  expect(resumed!.session.deriveMessages().some(message => message.source.kind === 'collaboration-peer')).toBe(true)
})

it.each(['queued', 'admitted'] as const)('recovers a persisted %s receipt by waking existing input once without charging twice', async (stateAtCrash) => {
  const { h, peer, box } = await setup()
  const recipient = peer.agent.id
  peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'initialize' }], source: { kind: 'user' } }))
  await peer.agent.whenIdle()
  await peer.dispose()
  const id = brandString<PeerMessageId>('crashed-message')
  const row = { id, sender: h.agent.id, recipient, connectionId, text: 'recover me', state: 'queued' as const }
  // Pause automatic wake while preparing the two durable crash-state records.
  const close = h.ctx.get('sessionController')!
  const resolver = close.resolveAgent.bind(close)
  const release = Promise.withResolvers<undefined>()
  close.resolveAgent = async (session) => { await release.promise; return resolver(session) }
  try {
    let state = h.ctx.collaborationStore.read()
    await h.ctx.collaborationStore.transact(state.revision, current => applyDiscussionOperation(current, { kind: 'enqueue', message: row },
      { actor: { kind: 'session', sessionId: h.agent.id }, timestamp: new Date().toISOString() }))
    state = h.ctx.collaborationStore.read()
    await h.ctx.collaborationStore.transact(state.revision, current => applyDiscussionOperation(current, { kind: 'reserve-activation', messageId: id },
      { actor: { kind: 'system' }, timestamp: new Date().toISOString() }))
    const stored = await h.ctx.sessionPersistence.open(recipient, 'write')
    try {
      const before = (await stored.read()).events
      await stored.append([{ type: 'agent/inbox/spliced', seq: SessionSeq(before.length), time: Date.now(),
        data: { target: 'next-turn', start: 0, inserted: [framePeerMessage(row, 16384)] } }])
    } finally { await stored.close() }
    if (stateAtCrash === 'admitted') {
      state = h.ctx.collaborationStore.read()
      await h.ctx.collaborationStore.transact(state.revision, current => applyDiscussionOperation(current, { kind: 'admit', messageId: id },
        { actor: { kind: 'system' }, timestamp: new Date().toISOString() }))
    }
    release.resolve(undefined)
    await box.whenSettled()
    await h.ctx.agents.get(recipient)!.whenIdle()
    expect(h.ctx.collaborationStore.read().outbox[0]?.state).toBe('admitted')
    expect(h.ctx.collaborationStore.read().connections[0]?.budget.used).toBe(1)
    expect(h.requests).toHaveLength(2)
  } finally { release.resolve(undefined); close.resolveAgent = resolver }
})

it('keeps valid-policy peer authority strict when a listener rewrites the claimed array in place', async () => {
  const { h, peer, box } = await setup()
  h.ctx.on('agent/pre-step', async ({ messages }, next) => {
    for (const [index, message] of messages.entries()) messages[index] = { ...message, source: { kind: 'user' } }
    return next()
  })
  h.scriptModelToolCall('write', { file_path: 'forged-human.txt' })
  await box.send(h.agent, request())
  await box.whenSettled()
  await peer.agent.whenIdle()
  expect(h.executed).not.toContain('write')
  expect(await h.workspaceFileExists('forged-human.txt')).toBe(false)
})

it.each(['human', 'later-policy'] as const)('preserves original required-policy attribution through %s pre-step rewrite in durable history and actual request', async (rewrite) => {
  const { h, peer, box } = await setup()
  h.ctx.on('agent/pre-step', async ({ messages }, next) => {
    for (const [index, message] of messages.entries()) messages[index] = {
      ...message, content: [{ type: 'text', text: 'transformed body' }],
      source: rewrite === 'human' ? { kind: 'user' } : { kind: 'later', requiredAdmissionPolicy: 'later' },
    }
    return next()
  })
  h.ctx.agents.registerInputPolicy('later', () => true)
  const receipt = await box.send(h.agent, request())
  await box.whenSettled(); await peer.agent.whenIdle()
  const expected = { kind: 'collaboration-peer', senderSessionId: h.agent.id, recipientSessionId: peer.agent.id,
    connectionId, messageId: receipt.messageId, requiredAdmissionPolicy: 'collaboration-peer' }
  const logged = peer.agent.session.snapshotEvents(SessionLogOffset(0)).filter(event => event.type === 'user/message')
  expect(logged).toHaveLength(1)
  expect(logged[0]?.data).toMatchObject({ source: expected, content: [{ type: 'text', text: 'transformed body' }] })
  expect(h.requests[0]?.messages.find(message => message.role === 'user')).toMatchObject({ source: expected, content: [{ type: 'text', text: 'transformed body' }] })
})

it.each(['pause', 'disconnect'] as const)('keeps an already-running peer turn alive after %s but refuses new admission', async (change) => {
  const { h, peer, box, mutate } = await setup()
  const gate = h.holdModelToolCall('read', {})
  try {
    await box.send(h.agent, request())
    await gate.started
    await mutate(change === 'pause' ? { kind: 'pause', connectionId, paused: true } : { kind: 'disconnect', connectionId })
    await expect(box.send(h.agent, request('later'))).rejects.toThrow(/absent|paused/)
    gate.release()
    await peer.agent.whenIdle()
    expect(h.executed).toEqual(['read'])
    expect(h.requests).toHaveLength(2)
    await h.ctx.sessionPersistence.flush()
    const stored = await h.ctx.sessionPersistence.open(peer.agent.id, 'read')
    try { expect((await stored.read()).events.findLast(event => event.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'completed' } }) }
    finally { await stored.close() }
  } finally { gate.release() }
})

it.each(['flush', 'ack'] as const)('retains the exact pending peer across persistent ACK failure and a human wake at %s', async (window) => {
  const { h, peer, box } = await setup()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  const flush = h.ctx.sessionPersistence.flush.bind(h.ctx.sessionPersistence)
  let failAck = true
  let held = false
  const hold = async () => { held = true; entered.resolve(undefined); await release.promise }
  store.transact = async (revision, transform) => {
    if (window === 'ack' && !held && transform(store.read()).journal.at(-1)?.operation === 'admit') await hold()
    return transact(revision, (current) => {
      const next = transform(current)
      if (failAck && next.journal.at(-1)?.operation === 'admit') throw new Error('persistent ACK failure')
      return next
    })
  }
  h.ctx.sessionPersistence.flush = async () => {
    await flush()
    if (window === 'flush' && !held && peer.agent.inbox.nextTurn.some(message => message.source.kind === 'collaboration-peer')) await hold()
  }
  const inserted: string[] = []
  const discarded: string[] = []
  h.ctx.on('agent/inbox/inserted', ({ message }) => { if (message.source.kind === 'collaboration-peer') inserted.push(message.id) })
  h.ctx.on('agent/inbox/discarded', ({ message }) => { if (message.source.kind === 'collaboration-peer') discarded.push(message.id) })
  try {
    await box.send(h.agent, request())
    await entered.promise
    const pending = peer.agent.inbox.nextTurn[0]
    peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'human priority' }], source: { kind: 'user' } }))
    release.resolve(undefined)
    await box.whenSettled()
    await peer.agent.whenIdle()
    await box.whenSettled()
    expect(h.requests).toHaveLength(1)
    expect(peer.agent.inbox.nextTurn).toEqual([pending])
    expect(store.read().outbox[0]?.state).toBe('queued')
    failAck = false
    box.recover()
    await box.whenSettled()
    await peer.agent.whenIdle()
    expect(peer.agent.session.deriveMessages().filter(message => message.role === 'user').map(message => message.source.kind))
      .toEqual(['user', 'collaboration-peer'])
    expect(h.requests).toHaveLength(2)
    expect(inserted).toEqual([pending?.id])
    expect(discarded).toEqual([])
    expect(store.read().connections[0]?.budget.used).toBe(1)
    expect(store.read().outbox[0]?.state).toBe('admitted')
  } finally { release.resolve(undefined); store.transact = transact; h.ctx.sessionPersistence.flush = flush }
})

it('holds a paused pending receipt and resumes it once after ACK recovery', async () => {
  const { h, peer, box, mutate } = await setup()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  store.transact = (revision, transform) => transact(revision, (current) => {
    const next = transform(current)
    if (next.journal.at(-1)?.operation === 'admit') throw new Error('ACK unavailable')
    return next
  })
  try {
    await box.send(h.agent, request())
    await box.whenSettled()
    const pending = peer.agent.inbox.nextTurn[0]
    await mutate({ kind: 'pause', connectionId, paused: true })
    store.transact = transact
    peer.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'human during pause' }], source: { kind: 'user' } }))
    await peer.agent.whenIdle()
    await box.whenSettled()
    expect(h.requests).toHaveLength(1)
    expect(peer.agent.inbox.nextTurn).toEqual([pending])
    await mutate({ kind: 'pause', connectionId, paused: false })
    await box.whenSettled()
    await peer.agent.whenIdle()
    expect(h.requests).toHaveLength(2)
    expect(store.read().outbox[0]?.state).toBe('admitted')
    expect(store.read().connections[0]?.budget.used).toBe(1)
  } finally { store.transact = transact }
})

it('never acknowledges a cancelled historical insertion as an admitted empty inbox', async () => {
  const { h, peer, box } = await setup()
  const store = h.ctx.collaborationStore
  const transact = store.transact.bind(store)
  store.transact = (revision, transform) => transact(revision, (current) => {
    const next = transform(current)
    if (next.journal.at(-1)?.operation === 'admit') throw new Error('ACK unavailable')
    return next
  })
  try {
    await box.send(h.agent, request())
    await box.whenSettled()
    const pending = peer.agent.inbox.nextTurn[0]!
    peer.agent.inbox.remove(pending.id)
    store.transact = transact
    box.recover()
    await box.whenSettled()
    expect(h.requests).toHaveLength(0)
    expect(store.read().outbox[0]?.state).toBe('failed')
    expect(h.ctx.sessionProjections.stateOf(peer.agent.session, 'collaborationReceipts')?.receipts[0]?.phase).toBe('cancelled')
  } finally { store.transact = transact }
})

it('refuses continuation of a running peer when its required policy is disposed', async () => {
  const { h, peer, box } = await setup()
  const gate = h.holdModelToolCall('read', {})
  try {
    await box.send(h.agent, request())
    await gate.started
    await box.close()
    gate.release()
    await peer.agent.whenIdle()
    expect(h.requests).toHaveLength(1)
    await h.ctx.sessionPersistence.flush()
    const stored = await h.ctx.sessionPersistence.open(peer.agent.id, 'read')
    try { expect((await stored.read()).events.findLast(event => event.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'blocked' } }) }
    finally { await stored.close() }
  } finally { gate.release() }
})

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'compaction-fixture': { kind: 'compaction-fixture' }
    'later': { kind: 'later' }
  }
}
