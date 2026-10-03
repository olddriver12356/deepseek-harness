import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Ledger } from '../src/ledger.ts'
const roots: string[] = []
afterEach(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }); roots.length = 0 })
function directory() { const root = mkdtempSync(join(tmpdir(), 'peer-ledger-')); roots.push(root); return root }
it('turns ambiguous durable work into unknown and never evicts tombstones', () => {
  const root = directory()
  const first = new Ledger(root, 1, 512)
  first.put({ fingerprint: 'a'.repeat(64), sessionId: 'owner', messageId: 'message-1', result: { requestId: 'r1', status: 'running', turn: 2 } })
  first.close()
  const second = new Ledger(root, 1, 512)
  try {
    expect(second.get('r1')?.result).toEqual({ requestId: 'r1', status: 'unknown', turn: 2, failureCode: 'restart_execution_unknown' })
    expect(() => {
      second.put({ fingerprint: 'b'.repeat(64), sessionId: 'owner', messageId: 'message-1', result: { requestId: 'r2', status: 'queued' } })
    }).toThrow('full')
    expect(() => new Ledger(root, 1, 512)).toThrow()
  } finally { second.close() }
})
it('refuses corrupted durable state rather than treating it as empty', () => {
  const root = directory()
  writeFileSync(join(root, 'requests.json'), '{invalid', { mode: 0o600 })
  expect(() => new Ledger(root, 1, 512)).toThrow()
})
it('rejects unknown durable fields which could escape output limits', () => {
  const root = directory()
  writeFileSync(join(root, 'requests.json'), JSON.stringify({ version: 1, entries: [{ fingerprint: 'a'.repeat(64), sessionId: 'owner', messageId: 'message-1', result: { requestId: 'r1', status: 'queued', surprise: 'private' } }] }), { mode: 0o600 })
  expect(() => new Ledger(root, 1, 512)).toThrow()
})
