import { afterEach, expect, it } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import { SessionId } from '@deepseek-ai/dsh-session'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { z } from 'zod'
import { applyDiscussionOperation } from '../src/state.ts'
import { connectionSchema, outboxSchema, peerMessageIdSchema, registrationSchema } from '../src/schema.ts'
import type { ConnectionId, DiscussionOperation } from '../src/types.ts'
import { createCollaborationHarness, type CollaborationHarness } from './helpers/harness.ts'

const opened: CollaborationHarness[] = []
afterEach(async () => { while (opened.length) await opened.pop()!.dispose() })
const connectionId = brandString<ConnectionId>('tool-pair')
const request = { connectionId, text: 'A peer fact', requestId: 'send-1' }

async function setup(allow = true) {
  const h = await createCollaborationHarness({ withDiscussionTools: true,
    peerDiscussionTools: allow ? ['read', 'collaboration_status', 'peer_send'] : ['read'] })
  opened.push(h)
  const peer = await h.ctx.agents.create({ sessionId: SessionId('tool-recipient'),
    meta: { cwd: h.agent.session.header.cwd! }, agentOptions: { provider: 'mock', model: 'mock' } })
  const mutate = async (operation: DiscussionOperation) => {
    const state = h.ctx.collaborationStore.read()
    await h.ctx.collaborationStore.transact(state.revision, current => applyDiscussionOperation(current, operation,
      { actor: { kind: 'human', sessionId: operation.kind === 'add-peer' ? operation.connection.sessions[0] : h.agent.id },
        admission: h.admitUiDiscussion(), timestamp: new Date().toISOString() }))
  }
  await mutate({ kind: 'add-peer', registrations: [
    { sessionId: h.agent.id, title: 'Caller', cwd: h.agent.session.header.cwd! },
    { sessionId: peer.agent.id, title: 'Peer', cwd: h.agent.session.header.cwd! },
  ], connection: { id: connectionId, sessions: [h.agent.id, peer.agent.id], disclosureAccepted: true,
    grants: { snapshot: true, follow: true }, paused: false, budget: { limit: 0, used: 0 } } })
  return { h, peer, mutate }
}

function json(result: Awaited<ReturnType<CollaborationHarness['executeCurrentTool']>>): unknown {
  const block = result.result.content[0]
  if (block?.type !== 'text') throw new Error('expected model JSON text')
  return JSON.parse(block.text)
}

const statusSchema = z.strictObject({ revision: z.number(), connections: z.array(connectionSchema),
  registrations: z.array(registrationSchema), messages: z.array(outboxSchema) })
const acceptanceSchema = z.strictObject({ accepted: z.literal(true), state: z.literal('queued'), revision: z.number(), messageId: peerMessageIdSchema })
const status = (result: Awaited<ReturnType<CollaborationHarness['executeCurrentTool']>>) => statusSchema.parse(json(result))
const acceptance = (result: Awaited<ReturnType<CollaborationHarness['executeCurrentTool']>>) => acceptanceSchema.parse(json(result))

it('installs only two opt-in tools and removes tools and policy on disposal', async () => {
  const { h } = await setup()
  const names = h.ctx.tools.schemas(h.agent).map(tool => tool.name)
  expect(names).toContain('collaboration_status')
  expect(names).toContain('peer_send')
  expect(names.some(name => name.startsWith('collaboration_') && name !== 'collaboration_status')).toBe(false)
  const entry = [...h.ctx.loader.entries()].find(row => row.options.name === 'discussion-tools')!
  await entry.fiber!.dispose()
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).not.toContain('peer_send')
  expect(h.ctx.tools.schemas(h.agent).map(tool => tool.name)).not.toContain('collaboration_status')
  await h.deliverHumanTurn('hello')
  expect(JSON.stringify(h.requests.at(-1)?.messages)).not.toContain('Independent peers')
})

it('derives sender from the executing Agent and returns stable queued acceptance on retry', async () => {
  const { h, peer } = await setup()
  const first = await h.executeCurrentTool('peer_send', request)
  expect(first.accepted).toBe(true)
  const value = acceptance(first)
  expect(value).toMatchObject({ accepted: true, state: 'queued', revision: 2 })
  expect(typeof value.messageId).toBe('string')
  expect(json(await h.executeCurrentTool('peer_send', request))).toEqual(value)
  expect(h.ctx.collaborationStore.read().outbox).toMatchObject([{ sender: h.agent.id, recipient: peer.agent.id, text: request.text }])
  expect(h.ctx.collaborationStore.read().requests).toHaveLength(1)
})

it.each([
  { ...request, sender: 'someone-else' }, { ...request, actor: { kind: 'human' } },
  { ...request, sessionId: 'someone-else' }, { ...request, recipient: 'collaboration-harness' },
  { ...request, collaborationId: 'forged' }, { ...request, taskId: '../unsafe' },
  { ...request, connectionId: '\u0000bad' }, { ...request, requestId: '\ninvalid' },
  { ...request, text: '界'.repeat(17000) },
])('rejects sender overrides, associations and invalid bounded input at execution: %j', async (args) => {
  const { h } = await setup()
  expect((await h.executeCurrentTool('peer_send', args)).accepted).toBe(false)
  expect(h.ctx.collaborationStore.read().outbox).toEqual([])
})

it('rejects unknown or foreign connections and self-target attempts', async () => {
  const { h, mutate } = await setup()
  const foreign = brandString<ConnectionId>('foreign-pair')
  const other = [SessionId('other-a'), SessionId('other-b')] as const
  const registration = (sessionId: (typeof other)[number]) => ({ sessionId, title: 'Other', cwd: h.agent.session.header.cwd! })
  await mutate({ kind: 'add-peer', registrations: [registration(other[0]), registration(other[1])],
    connection: { id: foreign, sessions: other, disclosureAccepted: true, paused: false,
      grants: { snapshot: true, follow: true }, budget: { limit: 0, used: 0 } } })
  expect(status(await h.executeCurrentTool('collaboration_status', {})).connections.map(pair => pair.id)).toEqual([connectionId])
  for (const id of ['unknown', h.agent.id, foreign]) {
    expect((await h.executeCurrentTool('peer_send', { ...request, connectionId: id })).accepted).toBe(false)
  }
  expect(h.ctx.collaborationStore.read().outbox).toEqual([])
})

it('rejects missing and replaced executing Agents without changing durable state', async () => {
  const { h } = await setup()
  const execution = { signal: new AbortController().signal, callId: ToolCallId('identity-check'), name: 'peer_send', arguments: request }
  expect((await h.ctx.tools.execute(execution)).isError).toBe(true)
  expect((await h.ctx.tools.execute({ ...execution, agent: { ...h.agent } })).isError).toBe(true)
  expect(h.ctx.collaborationStore.read().outbox).toEqual([])
})

it('reports admission separately while a retry preserves the original queued receipt', async () => {
  const { h, peer, mutate } = await setup()
  await mutate({ kind: 'budget', connectionId, limit: 1 })
  const original = acceptance(await h.executeCurrentTool('peer_send', request))
  await h.ctx.collaborationMailbox.whenSettled()
  await peer.agent.whenIdle()
  expect(status(await h.executeCurrentTool('collaboration_status', {})).messages[0]?.state).toBe('admitted')
  expect(json(await h.executeCurrentTool('peer_send', request))).toEqual(original)
  expect((await h.executeCurrentTool('peer_send', { ...request, text: 'changed intent' })).accepted).toBe(false)
  expect(h.ctx.collaborationStore.read().outbox).toHaveLength(1)
})

it.each(['cancelled', 'failed'] as const)('projects %s without claiming a peer reply', async (state) => {
  const { h } = await setup()
  const receipt = acceptance(await h.executeCurrentTool('peer_send', request))
  const saved = h.ctx.collaborationStore.read()
  await h.ctx.collaborationStore.transact(saved.revision, current => applyDiscussionOperation(current,
    { kind: 'settle', messageId: receipt.messageId, state }, { actor: { kind: 'system' }, timestamp: new Date().toISOString() }))
  const result = await h.executeCurrentTool('collaboration_status', {})
  expect(status(result).messages[0]).toMatchObject({ id: receipt.messageId, state })
  expect(status(result).messages[0]).not.toHaveProperty('reply')
  expect(h.ctx.tools.get('collaboration_status', h.agent)?.presentResult?.({}, result.result)).toEqual({
    card: 'generic', title: 'Peer discussion status', content: result.result.content,
  })
})

it('returns only caller-granted committed records and rejects a view identity argument', async () => {
  const { h, mutate } = await setup()
  await h.executeCurrentTool('peer_send', request)
  const view = status(await h.executeCurrentTool('collaboration_status', {}))
  expect(view.connections).toHaveLength(1)
  expect(view.messages[0]).toMatchObject({ state: 'queued', text: request.text })
  expect(view).not.toHaveProperty('journal')
  expect(view).not.toHaveProperty('requests')
  expect((await h.executeCurrentTool('collaboration_status', { sessionId: 'other' })).accepted).toBe(false)
  await mutate({ kind: 'grants', connectionId, grants: { snapshot: false, follow: true } })
  expect(json(await h.executeCurrentTool('collaboration_status', {}))).toMatchObject({ connections: [], registrations: [], messages: [] })
})

it('enforces the same allowlist for native model calls and alternate executor calls', async () => {
  const { h } = await setup(false)
  expect((await h.executeCurrentTool('peer_send', request)).accepted).toBe(false)
  h.scriptModelToolCall('peer_send', request)
  await h.deliverPeerDiscussion('Please send this')
  const events = await h.storedEvents()
  expect(events.filter(event => event.type === 'tool/result').at(-1)?.data).toMatchObject({ message: { role: 'tool', isError: true } })
  expect(h.ctx.collaborationStore.read().outbox).toEqual([])
})

it('logs actual model instructions, tool call and exact rendered result in the owning session', async () => {
  const { h } = await setup()
  h.scriptModelToolCall('peer_send', request)
  await h.deliverHumanTurn('Discuss this fact with my connected peer')
  const events = await h.storedEvents()
  const system = events.find(event => event.type === 'system/message')
  expect(JSON.stringify(system?.data)).toContain('Independent peers')
  expect(JSON.stringify(system?.data)).toContain('current attempt')
  expect(events.find(event => event.type === 'tool/call')?.data).toMatchObject({ name: 'peer_send', arguments: JSON.stringify(request) })
  const result = events.find(event => event.type === 'tool/result')
  expect(result?.data).toMatchObject({ message: { role: 'tool', isError: false } })
  expect(h.requests.at(-1)?.messages.some(message =>
    JSON.stringify(message) === JSON.stringify(result?.data.message))).toBe(true)
  const prompt = h.requests[0]!.messages.find(message => message.role === 'system')
  expect({ policy: prompt?.content, tools: h.requests[0]!.tools?.filter(tool =>
    tool.name === 'peer_send' || tool.name === 'collaboration_status') }).toMatchSnapshot('installed discussion tools and policy')
})
