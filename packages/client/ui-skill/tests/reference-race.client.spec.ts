import { expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { ResourceRegistry } from '../../resources/src/client/resources.ts'
import { referenceAddress, referenceResourceProvider } from '../src/client/reference-resources.ts'
import { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ToolReferenceSnapshot } from '@deepseek-ai/dsh-host-plugin-inventory/types'

it('releases A during a pending read and lets B settle without receiving A late content', async () => {
  const ctx = new ClientContext()
  const resources = new ResourceRegistry(ctx)
  const first = Promise.withResolvers<Awaited<ReturnType<Context['remote']['pluginInventory']['referenceList']>>>()
  const snapshot: ToolReferenceSnapshot = { observedAt: 2, sessionAvailability: 'not-selected', commands: [], mcp: { kind: 'ready', items: [] }, hooks: { kind: 'ready', items: [] } }
  const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ok: true, value: snapshot })
  const inventory = { referenceList: read, list: vi.fn().mockResolvedValue({ ok: true, value: { entries: [] } }), referenceDetail: vi.fn(), commandReference: vi.fn() }
  const unsubscriptions = vi.fn()
  resources.register(referenceResourceProvider(inventory, () => unsubscriptions))
  const a = resources.source(referenceAddress({ kind: 'catalog', locale: 'en', generation: 0 }))
  const releaseA = a.subscribe(() => {})
  await vi.waitFor(() => { expect(read).toHaveBeenCalledOnce() })
  releaseA()
  const b = resources.source(referenceAddress({ kind: 'catalog', locale: 'zh', generation: 0 }))
  const releaseB = b.subscribe(() => {})
  await vi.waitFor(() => { expect(b.getSnapshot()).toMatchObject({ status: 'live', value: { snapshot } }) })
  first.resolve({ ok: true, value: { ...snapshot, observedAt: 1 } })
  await vi.waitFor(() => { expect(unsubscriptions).toHaveBeenCalledOnce() })
  expect(b.getSnapshot()).toMatchObject({ value: { snapshot: { observedAt: 2 } } })
  releaseB()
  await vi.waitFor(() => { expect(unsubscriptions).toHaveBeenCalledTimes(2) })
  await ctx.fiber.dispose()
})
