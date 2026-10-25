import { expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolReferenceSnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'
import { referenceAddress, parseReferenceAddress, referenceResourceProvider } from '../src/client/reference-resources.ts'

const snapshot: ToolReferenceSnapshot = {
  observedAt: 1, sessionAvailability: 'not-selected', commands: [], mcp: { kind: 'ready', items: [] }, hooks: { kind: 'ready', items: [] },
}

it('round trips explicit scope, preset and locale without treating a preset as availability', () => {
  const target = { locale: 'zh' as const, sessionId: 'session/?#' as import('@deepseek-ai/dsh-session/types').SessionId, presetId: 'preset/?#', generation: 2, kind: 'catalog' as const }
  expect(parseReferenceAddress(referenceAddress(target))).toEqual(target)
  expect(parseReferenceAddress('https://example.test')).toBeUndefined()
  expect(parseReferenceAddress('dsh-resource://tool-reference/catalog?locale=unknown')).toBeUndefined()
})

it('reads only an open resource, refreshes on relevant events, and unsubscribes when released', async () => {
  const read = vi.fn().mockResolvedValue({ ok: true, value: snapshot })
  const inventory = { referenceList: read, list: vi.fn().mockResolvedValue({ ok: true, value: { entries: [] } }), referenceDetail: vi.fn(), commandReference: vi.fn() } satisfies Pick<Context['remote']['pluginInventory'], 'referenceList' | 'list' | 'referenceDetail' | 'commandReference'>
  let listener: ((sessionId?: import('@deepseek-ai/dsh-session/types').SessionId) => void) | undefined
  const unsubscribe = vi.fn()
  const provider = referenceResourceProvider(inventory, callback => { listener = callback; return unsubscribe })
  expect(read).not.toHaveBeenCalled()
  const controller = new AbortController()
  const stream = provider.open(referenceAddress({ locale: 'en', generation: 0, kind: 'catalog' }), { signal: controller.signal })[Symbol.asyncIterator]()
  expect(await stream.next()).toMatchObject({ value: { ok: true, value: { kind: 'catalog', snapshot } } })
  const next = stream.next()
  listener?.('another-session' as import('@deepseek-ai/dsh-session/types').SessionId)
  await Promise.resolve()
  expect(read).toHaveBeenCalledTimes(1)
  listener?.()
  expect(await next).toMatchObject({ value: { ok: true } })
  controller.abort()
  await stream.return?.()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
})

it('drops a pending response after resource release and exposes no raw thrown error', async () => {
  const pending = Promise.withResolvers<Awaited<ReturnType<Context['remote']['pluginInventory']['referenceList']>>>()
  const inventory = { referenceList: () => pending.promise, list: vi.fn().mockResolvedValue({ ok: true, value: { entries: [] } }), referenceDetail: vi.fn(), commandReference: vi.fn() }
  const unsubscribe = vi.fn()
  const provider = referenceResourceProvider(inventory, () => unsubscribe)
  const controller = new AbortController()
  const stream = provider.open(referenceAddress({ locale: 'en', generation: 0, kind: 'catalog' }), { signal: controller.signal })[Symbol.asyncIterator]()
  const result = stream.next()
  controller.abort()
  expect(unsubscribe).toHaveBeenCalledOnce()
  pending.resolve({ ok: true, value: snapshot })
  expect((await result).done).toBe(true)
  expect(unsubscribe).toHaveBeenCalledOnce()
  const failed = referenceResourceProvider({ ...inventory, referenceList: () => Promise.reject(new Error('SECRET_FAILURE')) }, () => () => {})
  const iterator = failed.open(referenceAddress({ locale: 'en', generation: 1, kind: 'catalog' }), { signal: new AbortController().signal })[Symbol.asyncIterator]()
  const frame = await iterator.next()
  expect(frame.value).toMatchObject({ ok: false })
  expect(JSON.stringify(frame.value)).not.toContain('SECRET_FAILURE')
  await iterator.return?.()
})
