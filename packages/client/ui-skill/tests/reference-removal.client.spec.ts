import { expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { referenceAddress, referenceResourceProvider } from '../src/client/reference-resources.ts'

it('rechecks an invalidated pending detail instead of publishing a removed contribution', async () => {
  const first = Promise.withResolvers<Awaited<ReturnType<Context['remote']['pluginInventory']['referenceDetail']>>>()
  const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true, value: null })
  let notify: ((sessionId?: SessionId) => void) | undefined
  const release = vi.fn()
  const provider = referenceResourceProvider({ referenceDetail: read, referenceList: vi.fn(), commandReference: vi.fn(), list: vi.fn() }, (listener) => { notify = listener; return release })
  const controller = new AbortController()
  const stream = provider.open(referenceAddress({ kind: 'detail', locale: 'en', generation: 0, selected: 'removed' }), { signal: controller.signal })[Symbol.asyncIterator]()
  const pending = stream.next()
  await vi.waitFor(() => { expect(read).toHaveBeenCalledOnce() })
  notify?.()
  first.resolve({ ok: true, value: { id: 'removed' as import('@deepseek-ai/dsh-host-plugin-inventory/types').ToolReferenceId, kind: 'hook', name: 'Stale handler', moduleName: 'adapter', scope: { kind: 'host' }, description: '', documentation: 'missing', state: 'unavailable', code: 'REFERENCE_SOURCE_UNAVAILABLE' } })
  expect(await pending).toMatchObject({ value: { ok: true, value: { kind: 'detail', detail: null } } })
  expect(read).toHaveBeenCalledTimes(2)
  controller.abort()
  await stream.return?.()
  expect(release).toHaveBeenCalledOnce()
})
