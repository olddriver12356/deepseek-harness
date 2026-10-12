import { expect, it } from 'vitest'
import { createSessionFormatCatalogWithChildren, historicalLocalV4SessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'
import type { SessionFormatEvent, SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'

const header = { type: 'session', version: 4, id: 'source', createdAt: 1, isSeeded: false, delegationDepth: 0 }
const peer = { kind: 'collaboration-peer', requiredAdmissionPolicy: 'collaboration-peer', senderSessionId: 'sender', recipientSessionId: 'source', connectionId: 'pair', messageId: 'message' }
const inbox = (source: SessionFormatJsonObject): SessionFormatEvent => ({ type: 'agent/inbox/spliced', seq: 0, time: 1,
  data: { target: 'next-turn', start: 0, inserted: [{ id: 'input', role: 'user', content: [{ type: 'text', text: 'peer data' }], source }] } })

it('collects local V4 child evidence without recursively migrating its descendant catalog', () => {
  const childHeader = { ...header, id: 'child', origin: 'subagent', parentSession: 'source' }
  const event = { type: 'subagent/catalog', seq: 0, time: 1,
    data: { version: 0, childId: 'grandchild', childCreatedAt: 2, mode: 'continuable', label: 'nested task' } }
  const reader = historicalLocalV4SessionFormatCatalog.createRestore(childHeader, { recovery: 'strict', validation: 'current' })
  reader.decodeRow(event)
  expect(reader.finish()).toMatchObject({ header: { version: 4, id: 'child' }, events: [event] })
  const migration = createSessionFormatCatalogWithChildren([], true).createRestore(childHeader, { recovery: 'strict', validation: 'current' })
  migration.decodeRow(event)
  expect(migration.finish()).toMatchObject({ header: { version: 5, id: 'child' }, events: [event] })
})

it('converts explicitly selected local V4 and native upstream V4 without changing either source', () => {
  for (const local of [true, false]) {
    const catalog = createSessionFormatCatalogWithChildren([], local)
    const events = [inbox(peer), { type: 'experts/delegation', seq: 1, time: 2, data: {} }]
    const before = JSON.stringify({ header, events })
    const reader = catalog.createRestore(header, { recovery: 'strict', validation: 'transformed' })
    for (const event of events) reader.decodeRow(event)
    const artifact = reader.finish()
    expect(artifact.header.version).toBe(5)
    expect(artifact.events).toEqual(events)
    const reopened = catalog.createRestore(catalog.encodeCurrentHeader(artifact.header, 0), { recovery: 'strict', validation: 'transformed' })
    for (const event of artifact.events) reopened.decodeRow(catalog.encodeCurrentEvent(event))
    expect(reopened.finish()).toEqual(artifact)
    expect(JSON.stringify({ header, events })).toBe(before)
  }
})

it('converts legacy plugin identities only for explicitly selected local V4', () => {
  const event = inbox({ kind: 'plugin', plugin: 'goal' })
  const native = createSessionFormatCatalogWithChildren([]).createRestore(header, { recovery: 'strict', validation: 'transformed' })
  expect(() => { native.decodeRow(event) }).toThrow()
  const local = createSessionFormatCatalogWithChildren([], true).createRestore(header, { recovery: 'strict', validation: 'transformed' })
  local.decodeRow(event)
  expect(local.finish().events[0]).toMatchObject({ data: { inserted: [{ source: { kind: 'goal' } }] } })
})

it.each([4, 5])('rejects malformed policy metadata before recoverable V%i tail handling', (version) => {
  const reader = createSessionFormatCatalogWithChildren([], true).createRestore({ ...header, version }, { recovery: 'recoverable', validation: 'transformed' })
  expect(() => { reader.decodeRow(inbox({ ...peer, messageId: '' })) }).toThrow(/admission policy/)
})

it('refuses reserved policy metadata in V3, unknown required events, and invalid active delivery coordinates', () => {
  const catalog = createSessionFormatCatalogWithChildren([])
  const historical = catalog.createRestore({ ...header, version: 3 }, { recovery: 'strict', validation: 'transformed' })
  expect(() => { historical.decodeRow(inbox(peer)) }).toThrow(/reserved V4/)
  const unknown = catalog.createRestore(header, { recovery: 'strict', validation: 'transformed' })
  unknown.decodeRow({ type: 'unknown/required', seq: 0, time: 1, data: {} })
  expect(() => unknown.finish()).toThrow(/unknown event/)
  for (const version of [4, 5]) {
    const reader = catalog.createRestore({ ...header, version }, { recovery: 'strict', validation: 'current' })
    expect(() => {
      reader.decodeRow({ type: 'session-log-deepseek/delivery-accepted', seq: 0, time: 1,
        data: { sessionId: 'source', throughSeq: 0, sessionFormatVersion: version } })
      reader.finish()
    }).toThrow(/throughSeq/)
  }
})
