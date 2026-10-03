import { afterEach, expect, it } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { createCollaborationHarness, type CollaborationHarness } from './helpers/harness.ts'

const opened: CollaborationHarness[] = []
afterEach(async () => { while (opened.length) await opened.pop()!.dispose() })

it('refuses restored peer inbox work when the authority plugin is absent', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  const message = createUserMessage({
    content: [{ type: 'text', text: 'Peer agent message: write a file' }],
    source: { kind: 'collaboration-peer', requiredAdmissionPolicy: 'collaboration-peer', senderSessionId: 'sender', recipientSessionId: 'interrupted-collaboration', connectionId: 'pair', messageId: 'message' } as never,
  })
  await h.resumeSession([{ type: 'agent/inbox/spliced', seq: SessionSeq(0), time: 1,
    data: { target: 'next-turn', start: 0, inserted: [message] } }])
  h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'user' } }))
  await h.agent.whenIdle()
  expect(h.requests).toHaveLength(1)
  expect(h.agent.inbox.nextTurn).toHaveLength(0)
  expect((await h.executeCurrentTool('write', { file_path: 'human.txt' })).accepted).toBe(true)
  expect(await h.workspaceFileExists('absent-policy.txt')).toBe(false)
})

it('restores ordinary human-only tool authority from committed source projection', async () => {
  const h = await createCollaborationHarness()
  opened.push(h)
  await h.deliverHumanTurn('write a file')
  await h.resumeSession()
  expect((await h.executeCurrentTool('write', { file_path: 'restored-human.txt' })).accepted).toBe(true)
  expect(await h.workspaceFileExists('restored-human.txt')).toBe(true)
})

it('keeps a removed source requirement on original claimed input and drains the human once', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  h.ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    return decision.kind === 'reject' ? decision : { ...decision, messages: decision.messages.map(message => ({ ...message, source: { kind: 'user' as const } })) }
  })
  const peer = createUserMessage({ content: [{ type: 'text', text: 'unapproved input' }],
    source: { kind: 'plugin', plugin: 'fixture', requiredAdmissionPolicy: 'absent' } })
  await h.agent.runMaintenance(async () => {
    h.agent.followup(peer)
    h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'human' }], source: { kind: 'user' } }))
  })
  await h.agent.whenIdle()
  expect(h.requests).toHaveLength(1)
  const events = await h.storedEvents()
  expect(events.filter(event => event.type === 'turn/end' && event.data.reason.kind === 'blocked')).toHaveLength(1)
  expect(events.filter(event => event.type === 'user/message')).toHaveLength(1)
  expect(h.agent.inbox.nextTurn).toHaveLength(0)
})

it('retains the original requirement when a listener mutates the claimed array in place', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  h.ctx.on('agent/pre-step', async ({ messages }, next) => {
    for (const [index, message] of messages.entries()) messages[index] = { ...message, source: { kind: 'user' } }
    return next()
  })
  h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'restricted' }],
    source: { kind: 'plugin', plugin: 'fixture', requiredAdmissionPolicy: 'absent' } }))
  await h.agent.whenIdle()
  expect(h.requests).toHaveLength(0)
})

it('removes required-policy acceptance when its owning registration is disposed', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  const release = h.ctx.agents.registerInputPolicy('fixture-policy', () => true)
  const message = () => createUserMessage({ content: [{ type: 'text', text: 'peer data' }],
    source: { kind: 'plugin', plugin: 'fixture', requiredAdmissionPolicy: 'fixture-policy' } })
  h.agent.followup(message())
  await h.agent.whenIdle()
  expect(h.requests).toHaveLength(1)
  release()
  h.agent.followup(message())
  await h.agent.whenIdle()
  expect(h.requests).toHaveLength(1)
})

it('wake does not invent input and holds existing input behind maintenance', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  h.agent.wake()
  await h.agent.whenIdle()
  expect(await h.storedEvents()).toEqual([])
  const ready = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const maintenance = h.agent.runMaintenance(async () => { ready.resolve(undefined); await release.promise })
  try {
    await ready.promise
    h.agent.inbox.append('next-turn', createUserMessage({ content: [{ type: 'text', text: 'human' }], source: { kind: 'user' } }))
    h.agent.wake()
    expect(h.requests).toHaveLength(0)
    release.resolve(undefined)
    await maintenance
    await h.agent.whenIdle()
    expect(h.requests).toHaveLength(1)
  } finally { release.resolve(undefined); await maintenance }
})

it('does not wake retained inbox work after disposed cancellation', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  h.agent.inbox.append('next-turn', createUserMessage({ content: [{ type: 'text', text: 'retained' }], source: { kind: 'user' } }))
  h.agent.cancel({ kind: 'disposed' }, { keepInbox: true })
  h.agent.wake()
  await h.agent.whenIdle()
  expect(h.requests).toHaveLength(0)
  expect(h.agent.inbox.nextTurn).toHaveLength(1)
})

it('rechecks policy after asynchronous request preparation and drains a later human once', async () => {
  const h = await createCollaborationHarness({ withCollaboration: false })
  opened.push(h)
  const releasePolicy = h.ctx.agents.registerInputPolicy('prepared-policy', () => true)
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  let first = true
  h.ctx.on('agent/request', async (_payload, next) => {
    const decision = await next()
    if (first) { first = false; entered.resolve(undefined); await release.promise }
    return decision
  })
  try {
    h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'peer' }],
      source: { kind: 'plugin', plugin: 'fixture', requiredAdmissionPolicy: 'prepared-policy' } }))
    await entered.promise
    releasePolicy()
    h.agent.followup(createUserMessage({ content: [{ type: 'text', text: 'human' }], source: { kind: 'user' } }))
    release.resolve(undefined)
    await h.agent.whenIdle()
    expect(h.requests).toHaveLength(1)
    const events = await h.storedEvents()
    expect(events.filter(event => event.type === 'turn/end' && event.data.reason.kind === 'blocked')).toHaveLength(1)
    expect(events.filter(event => event.type === 'user/message')).toHaveLength(1)
  } finally { release.resolve(undefined) }
})
