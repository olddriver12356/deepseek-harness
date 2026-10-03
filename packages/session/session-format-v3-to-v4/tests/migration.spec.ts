import { expect, it } from 'vitest'
import { sessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import { SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'
import { sessionFormatV3ToV4, v4SessionFormatCodec } from '../src/index.ts'

const source = { type: 'session', version: 3, id: 'source', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const sourceEvents = [
  { type: 'turn/start', seq: 0, time: 2, data: { turn: 1 } },
  { type: 'turn/end', seq: 1, time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
]
function restore(header: unknown, events = sourceEvents) {
  const decoder = sessionFormatCatalog.createRestore(header, { recovery: 'strict', validation: 'current' })
  for (const event of events) decoder.decodeRow(event)
  return decoder.finish()
}

it('migrates immutable released V3 input without changing events, identities, or coordinates', () => {
  const before = JSON.stringify([source, sourceEvents])
  const first = restore(source)
  expect(first.header.version).toBe(4)
  expect(first.events).toEqual(sourceEvents)
  expect(first.inheritedEventCount).toBe(0)
  expect(restore(source)).toEqual(first)
  expect(JSON.stringify([source, sourceEvents])).toBe(before)
})

it('preserves independent stage cuts and the complete seeded V0-to-V4 chain', () => {
  const parent = { version: 3, id: 'parent', createdAt: 1, isSeeded: true, delegationDepth: 0 }
  const stage = sessionFormatV3ToV4.createStage({ sourceHeader: parent, targetHeader: { ...parent, version: 4 }, sourceInheritedEventCount: undefined, sourceKind: 'decoded' })
  const collector = new SessionFormatEventCollector()
  stage.transformEvent({ type: 'session/end-seed', seq: 0, time: 1, data: { inherited: true } }, collector)
  expect(stage.finish(collector)).toBe(0)
  expect(restore({ type: 'session', version: 0, id: 'legacy', createdAt: 1, seedLength: 0, delegationDepth: 0 }, [])).toMatchObject({ header: { version: 4 }, inheritedEventCount: 0 })
  expect(restore(source).inheritedEventCount).toBe(0)
})

const peerSource = { kind: 'collaboration-peer', requiredAdmissionPolicy: 'collaboration-peer', senderSessionId: 'sender', recipientSessionId: 'source', connectionId: 'pair', messageId: 'message' }
function inbox(attribution: object) {
  return { type: 'agent/inbox/spliced', seq: 0, time: 1, data: { target: 'next-turn', start: 0,
    inserted: [{ id: 'input', role: 'user', content: [{ type: 'text', text: 'peer data' }], source: attribution }] } }
}

it('strictly restores attributed V4 inbox data and never drops its policy metadata', () => {
  const decoder = sessionFormatCatalog.createRestore({ ...source, version: 4 }, { recovery: 'strict', validation: 'current' })
  decoder.decodeRow(inbox(peerSource))
  expect(decoder.finish().events[0]).toEqual(inbox(peerSource))
})

it.each([
  { ...peerSource, requiredAdmissionPolicy: undefined },
  { ...peerSource, senderSessionId: 'source' },
  { ...peerSource, forgedHuman: true },
  { ...peerSource, messageId: '' },
])('refuses malformed policy attribution before interrupted-tail recovery', (attribution) => {
  const decoder = sessionFormatCatalog.createRestore({ ...source, version: 4 }, { recovery: 'interrupted-tail', validation: 'current' })
  expect(() =>{  decoder.decodeRow(inbox(attribution)) }).toThrow()
})

it('refuses reserved V4 metadata in a historical V3 source and unknown required events', () => {
  const decoder = sessionFormatCatalog.createRestore(source, { recovery: 'strict', validation: 'current' })
  expect(() => { decoder.decodeRow(inbox(peerSource)); decoder.finish() }).toThrow(/reserved V4/)
  const unknown = sessionFormatCatalog.createRestore(source, { recovery: 'strict', validation: 'current' })
  expect(() => { unknown.decodeRow({ type: 'unknown/required', seq: 0, time: 1, data: {} }); unknown.finish() }).toThrow(/unknown event/)
  expect(() => v4SessionFormatCodec.encodeHeader({ ...source, version: 5 }, 0)).toThrow(/v4/)
})
