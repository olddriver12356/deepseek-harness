import { describe, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { createHumanControlAdmission } from '../src/authority.ts'
import { collaborationStateSchema, discussionOperationSchema } from '../src/schema.ts'
import { applyDiscussionOperation, emptyCollaborationState, findRequestReceipt } from '../src/state.ts'
import { requestIdSchema } from '../src/schema.ts'

const a = SessionId('a')
const b = SessionId('b')
const human = { actor: { kind: 'human' as const, sessionId: a }, timestamp: '2026-10-02T12:00:00.000Z', admission: createHumanControlAdmission('discussion') }

function paired() {
  let state = emptyCollaborationState()
  for (const sessionId of [a, b]) state = applyDiscussionOperation(state, { kind: 'register', registration: { sessionId, title: sessionId, cwd: '/' } }, human)
  state = applyDiscussionOperation(state, discussionOperationSchema.parse({ kind: 'connect', connection: { id: 'ab', sessions: [a, b], disclosureAccepted: true, grants: { snapshot: false, follow: false }, budget: { limit: 1, used: 0 }, paused: false } }), human)
  return state
}
const system = { actor: { kind: 'system' as const }, timestamp: human.timestamp }
const operation = (value: unknown) => discussionOperationSchema.parse(value)
const enqueue = (id: string) => operation({ kind: 'enqueue', message: { id, connectionId: 'ab', sender: a, recipient: b, text: 'hi', state: 'queued' } })
const fromA = { actor: { kind: 'session' as const, sessionId: a }, timestamp: human.timestamp }

describe('V1a aggregate validation and transitions', () => {
  it('accepts an empty aggregate and rejects invalid identifiers and unsupported operation states', () => {
    expect(collaborationStateSchema.parse(emptyCollaborationState()).revision).toBe(0)
    expect(discussionOperationSchema.safeParse({ kind: 'register', registration: { sessionId: '', title: 'x', cwd: '/' } }).success).toBe(false)
    expect(discussionOperationSchema.safeParse({ kind: 'claim-task', taskId: 'x' }).success).toBe(false)
    expect(collaborationStateSchema.safeParse({ ...emptyCollaborationState(), tasks: [] }).success).toBe(false)
  })

  it('registration alone confers no connection or permission', () => {
    const state = applyDiscussionOperation(emptyCollaborationState(), { kind: 'register', registration: { sessionId: a, title: 'A', cwd: '/a' } }, human)
    expect(state.registrations).toHaveLength(1)
    expect(state.connections).toEqual([])
    expect(state.registrations[0]).not.toHaveProperty('role')
    expect(state.journal[0]).toMatchObject({ revision: 1, actor: human.actor, operation: 'register' })
  })

  it('requires host-created human admission for grants', () => {
    const { admission: _admission, ...withoutAdmission } = human
    expect(() => applyDiscussionOperation(emptyCollaborationState(), { kind: 'register', registration: { sessionId: a, title: 'A', cwd: '/a' } }, withoutAdmission)).toThrow(/human control/)
  })

  it('adds both display registrations and a disclosed pair atomically from a fresh aggregate', () => {
    const connection = paired().connections[0]
    const registrations = [{ sessionId: a, title: 'A', cwd: '/a' }, { sessionId: b, title: 'B', cwd: '/b' }]
    const state = applyDiscussionOperation(emptyCollaborationState(), operation({ kind: 'add-peer', registrations, connection }), human)
    expect(state.registrations).toHaveLength(2)
    expect(state.connections).toHaveLength(1)
    expect(state.journal).toHaveLength(1)
    expect(() => applyDiscussionOperation(emptyCollaborationState(), operation({ kind: 'add-peer', registrations: [registrations[0], registrations[0]], connection }), human)).toThrow(/exact connection endpoints/)
    expect(() => applyDiscussionOperation(emptyCollaborationState(), operation({ kind: 'add-peer', registrations, connection }), {
      ...human, actor: { kind: 'human', sessionId: b },
    })).toThrow(/Host-derived human session/)
  })

  it('keeps grants and budget strictly on each pair and cancels only queued messages on disconnect', () => {
    let state = emptyCollaborationState()
    for (const sessionId of [a, b, SessionId('c')]) state = applyDiscussionOperation(state, { kind: 'register', registration: { sessionId, title: sessionId, cwd: '/' } }, human)
    const pair = { id: 'ab', sessions: [a, b], disclosureAccepted: true, grants: { snapshot: true, follow: false }, budget: { limit: 2, used: 0 }, paused: false } as const
    state = applyDiscussionOperation(state, discussionOperationSchema.parse({ kind: 'connect', connection: pair }), human)
    state = applyDiscussionOperation(state, discussionOperationSchema.parse({ kind: 'connect', connection: { ...pair, id: 'ac', sessions: [a, 'c'], grants: { snapshot: false, follow: false } } }), human)
    state = applyDiscussionOperation(state, discussionOperationSchema.parse({ kind: 'enqueue', message: { id: 'm1', connectionId: 'ab', sender: a, recipient: b, text: 'hi', state: 'queued' } }), { ...human, actor: { kind: 'session', sessionId: a } })
    state = applyDiscussionOperation(state, discussionOperationSchema.parse({ kind: 'disconnect', connectionId: 'ab' }), human)
    expect(state.connections).toHaveLength(1)
    expect(state.connections[0]?.grants.snapshot).toBe(false)
    expect(state.outbox[0]?.state).toBe('cancelled')
    expect(state.journal.map(entry => entry.revision)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('records one atomic activation reservation and prevents recharge or budget replenishment', () => {
    let state = applyDiscussionOperation(paired(), enqueue('m1'), fromA)
    state = applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm1' }), system)
    expect(state.connections[0]?.budget).toEqual({ limit: 1, used: 1 })
    expect(state.outbox[0]).toMatchObject({ state: 'queued', activationReserved: true })
    expect(() => applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm1' }), system)).toThrow(/without a reservation/)
    state = applyDiscussionOperation(state, enqueue('m2'), fromA)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm2' }), system)).toThrow(/budget exhausted/)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'budget', connectionId: 'ab', limit: 0 }), human)).toThrow(/already charged/)
    state = applyDiscussionOperation(state, operation({ kind: 'budget', connectionId: 'ab', limit: 2 }), human)
    expect(state.connections[0]?.budget.used).toBe(1)
  })

  it('disconnect cancels reserved queued work and preserves already admitted recipient input', () => {
    let state = applyDiscussionOperation(paired(), enqueue('m1'), fromA)
    state = applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm1' }), system)
    const queued = applyDiscussionOperation(state, operation({ kind: 'disconnect', connectionId: 'ab' }), human)
    expect(queued.outbox[0]).toMatchObject({ state: 'cancelled', activationReserved: true })
    state = applyDiscussionOperation(state, operation({ kind: 'admit', messageId: 'm1' }), system)
    state = applyDiscussionOperation(state, operation({ kind: 'disconnect', connectionId: 'ab' }), human)
    expect(state.outbox[0]?.state).toBe('admitted')
    expect(() => applyDiscussionOperation(state, operation({ kind: 'settle', messageId: 'm1', state: 'cancelled' }), system)).toThrow(/only queued/)
  })

  it('pause blocks enqueues, wake reservations and recipient admission; resume preserves budget', () => {
    let state = applyDiscussionOperation(paired(), enqueue('m1'), fromA)
    state = applyDiscussionOperation(state, operation({ kind: 'pause', connectionId: 'ab', paused: true }), human)
    expect(() => applyDiscussionOperation(state, enqueue('m2'), fromA)).toThrow(/paused/)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm1' }), system)).toThrow(/paused/)
    state = applyDiscussionOperation(state, operation({ kind: 'pause', connectionId: 'ab', paused: false }), human)
    state = applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm1' }), system)
    state = applyDiscussionOperation(state, operation({ kind: 'pause', connectionId: 'ab', paused: true }), human)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'admit', messageId: 'm1' }), system)).toThrow(/paused/)
    state = applyDiscussionOperation(state, operation({ kind: 'pause', connectionId: 'ab', paused: false }), human)
    expect(state.connections[0]?.budget.used).toBe(1)
  })

  it('denies forged senders, absent pairs, missing disclosure and third-party recipients', () => {
    const state = paired()
    expect(() => applyDiscussionOperation(state, enqueue('m'), { ...fromA, actor: { kind: 'session', sessionId: b } })).toThrow(/sender/)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'enqueue', message: { id: 'm', connectionId: 'missing', sender: a, recipient: b, text: '', state: 'queued' } }), fromA)).toThrow(/absent/)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'enqueue', message: { id: 'm', connectionId: 'ab', sender: a, recipient: 'c', text: '', state: 'queued' } }), fromA)).toThrow(/endpoints/)
    expect(() => operation({ kind: 'connect', connection: { ...state.connections[0], disclosureAccepted: false } })).toThrow()
    expect(() => applyDiscussionOperation(state, operation({ kind: 'reserve-activation', messageId: 'm' }), fromA)).toThrow(/Host delivery worker/)
  })

  it('actor-scoped retry returns the original result without another revision or journal entry', () => {
    const requestId = requestIdSchema.parse('request-1')
    const op = enqueue('m')
    const state = applyDiscussionOperation(paired(), op, { ...fromA, requestId })
    const before = state.revision
    expect(findRequestReceipt(state, fromA.actor, requestId, op)?.result).toEqual({ revision: 4, messageId: 'm' })
    expect(findRequestReceipt(state, { kind: 'session', sessionId: b }, requestId)).toBeUndefined()
    expect(() => findRequestReceipt(state, fromA.actor, requestId, enqueue('different'))).toThrow(/different operation/)
    expect(state.revision).toBe(before)
    expect(state.journal).toHaveLength(before)
  })

  it('rejects corrupt pair ownership, journal ordering and request results', () => {
    const state = paired()
    expect(collaborationStateSchema.safeParse({ ...state, connections: [{ ...state.connections[0], sessions: [a, 'unknown'] }] }).success).toBe(false)
    expect(collaborationStateSchema.safeParse({ ...state, journal: [...state.journal].reverse() }).success).toBe(false)
    expect(collaborationStateSchema.safeParse({ ...state, journal: [] }).success).toBe(false)
    expect(() => applyDiscussionOperation(state, operation({ kind: 'connect', connection: { ...state.connections[0], id: 'other' } }), human)).toThrow(/session pair/)
    const queued = applyDiscussionOperation(state, enqueue('m'), fromA)
    const reserved = applyDiscussionOperation(queued, operation({ kind: 'reserve-activation', messageId: 'm' }), system)
    const incorrectBudget = { ...reserved.connections[0], budget: { limit: 1, used: 0 } }
    expect(collaborationStateSchema.safeParse({ ...reserved, connections: [incorrectBudget] }).success).toBe(false)
    const receipt = applyDiscussionOperation(state, enqueue('m'), { ...fromA, requestId: requestIdSchema.parse('r') })
    const incorrectResult = { ...receipt.requests[0], result: { revision: 4, messageId: 'different' } }
    expect(collaborationStateSchema.safeParse({ ...receipt, requests: [incorrectResult] }).success).toBe(false)
    const forgedActors = state.journal.map(row => ({ ...row, actor: fromA.actor }))
    expect(collaborationStateSchema.safeParse({ ...state, journal: forgedActors }).success).toBe(false)
  })

  it.each(['grants', 'pause', 'revision-zero'] as const)('rejects authority inconsistent with journal: %s', (corruption) => {
    const paused = applyDiscussionOperation(paired(), operation({ kind: 'pause', connectionId: 'ab', paused: true }), human)
    const corrupt = corruption === 'revision-zero' ? { ...paused, revision: 0, journal: [] }
      : { ...paused, connections: paused.connections.map(row => corruption === 'grants'
        ? { ...row, grants: { snapshot: true, follow: true } } : { ...row, paused: false }) }
    expect(collaborationStateSchema.safeParse(corrupt).success).toBe(false)
  })
})
