import { expect, it, vi } from 'vitest'
import { CollaborationDataSource } from '../src/client/data.ts'
import { sid, snapshot } from './fixtures.ts'

function remote() {
  let emit: ((value: typeof snapshot) => void) | undefined
  let end: (() => void) | undefined
  const stream = {
    restart: vi.fn(), dispose: vi.fn(async () => { end?.() }),
    async *[Symbol.asyncIterator]() {
      while (true) {
        const value = await new Promise<typeof snapshot | null>((resolve) => { emit = resolve; end = () => { resolve(null) } })
        if (value === null) return
        yield { value, generation: 1, accept: vi.fn() }
      }
    },
  }
  return { collaboration: { controlSnapshot: vi.fn(async () => ({ ok: true, value: snapshot })) }, $stream: () => stream, stream,
    emit: async (value: typeof snapshot) => { await vi.waitFor(() => { expect(emit).toBeDefined() }); emit!(value) } }
}

it('replaces complete views across aggregate revision gaps and removes revoked records', async () => {
  const r = remote()
  const source = new CollaborationDataSource(r as never, sid)
  source.start()
  await r.emit(snapshot)
  await vi.waitFor(() => { expect(source.getSnapshot().view?.revision).toBe(4) })
  await r.emit({ revision: 12, registrations: [], connections: [], outbox: [], observations: [] })
  await vi.waitFor(() => { expect(source.getSnapshot().view?.connections).toEqual([]) })
  expect(source.getSnapshot().view?.revision).toBe(12)
  await source.dispose()
  expect(r.stream.dispose).toHaveBeenCalledOnce()
})

it('maintains snapshot identity until changes and refreshes a failed generation', async () => {
  const r = remote()
  const source = new CollaborationDataSource(r as never, sid)
  expect(source.getSnapshot()).toBe(source.getSnapshot())
  await source.refresh()
  expect(source.getSnapshot().view).toBe(snapshot)
  expect(r.stream.restart).toHaveBeenCalledOnce()
  await source.dispose()
})

it('creates a new single-consumer logical stream after terminal failure', async () => {
  const r = remote()
  const first = { restart: vi.fn(), dispose: vi.fn(async () => {}), async *[Symbol.asyncIterator]() { throw new Error('terminal'); yield undefined } }
  const make = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(r.stream)
  const source = new CollaborationDataSource({ ...r, $stream: make } as never, sid)
  source.start()
  await vi.waitFor(() => { expect(source.getSnapshot().phase).toBe('failed') })
  await source.refresh()
  expect(make).toHaveBeenCalledTimes(2)
  await r.emit({ ...snapshot, revision: 5 })
  await vi.waitFor(() => { expect(source.getSnapshot().view?.revision).toBe(5) })
  await source.dispose()
})

it('does not let a delayed refresh replace a newer committed stream view', async () => {
  const r = remote()
  let settle!: (value: unknown) => void
  r.collaboration.controlSnapshot.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve }) as never)
  const source = new CollaborationDataSource(r as never, sid)
  source.start()
  const refreshed = source.refresh()
  await r.emit({ ...snapshot, revision: 6, connections: [] })
  await vi.waitFor(() => { expect(source.getSnapshot().view?.revision).toBe(6) })
  settle({ ok: true, value: snapshot })
  await refreshed
  expect(source.getSnapshot().view?.revision).toBe(6)
  expect(source.getSnapshot().view?.connections).toEqual([])
  await source.dispose()
})
