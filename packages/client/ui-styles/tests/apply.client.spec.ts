import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { apply, inject, type StyleApi } from '../src/client/index.ts'
import { StylesPanel } from '../src/client/StylesPanel.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never, () => null)
  const appPanels = new AppPanelsController()
  ctx.provide('appPanels', appPanels)
  const sessions = { list: { getSnapshot: () => ({ current: undefined }) }, binding: () => undefined }
  ctx.provide('sessions', sessions as never)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const styles = {
    list: vi.fn(async () => ({ ok: true, value: [] })),
    create: vi.fn(async () => ({ ok: true, value: {} })),
    update: vi.fn(async () => ({ ok: true, value: {} })),
    delete: vi.fn(async () => ({ ok: true, value: undefined })),
  }
  ctx.provide('remote.styles', styles as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  return { ctx, slots, appPanels, sessions, styles }
}

describe('Styles plugin apply', () => {
  it('declares the slot, app-panel, session, remote, and locale dependencies', () => {
    expect(inject).toEqual(['slots', 'appPanels', 'sessions', 'remote', 'remote.styles', 'locale'])
  })

  it('registers one persistent Styles overlay', async () => {
    const { ctx, slots, appPanels } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('shell.overlay')).toHaveLength(1) })
    const entry = slots.entries('shell.overlay')[0]!
    expect(entry.options.id).toBe('styles-panel')
    expect(entry.component).toBe(StylesPanel)
    const injected = (entry.inject as () => { appPanels: unknown; t: unknown; api: StyleApi })()
    expect(injected.appPanels).toBe(appPanels)
    expect(typeof injected.t).toBe('function')
    expect(typeof injected.api.list).toBe('function')
    expect(typeof injected.api.create).toBe('function')
    expect(typeof injected.api.update).toBe('function')
    expect(typeof injected.api.remove).toBe('function')
    expect(typeof injected.api.dispatch).toBe('function')
  })

  it('surfaces the Remote value for a successful list call', async () => {
    const { ctx, slots, styles } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('shell.overlay')).toHaveLength(1) })
    const entry = slots.entries('shell.overlay')[0]!
    const injected = (entry.inject as () => { api: StyleApi })()
    await expect(injected.api.list()).resolves.toEqual([])
    expect(styles.list).toHaveBeenCalledTimes(1)
  })

  it('rejects dispatch when there is no current session', async () => {
    const { ctx, slots } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('shell.overlay')).toHaveLength(1) })
    const entry = slots.entries('shell.overlay')[0]!
    const injected = (entry.inject as () => { api: StyleApi })()
    const style = {
      id: 's1', name: 'Concise', description: '', instructions: 'do it', status: 'approved', updatedAt: '2026-09-06',
    } as Parameters<StyleApi['dispatch']>[0]
    await expect(injected.api.dispatch(style, 'task')).rejects.toThrow()
  })
})
