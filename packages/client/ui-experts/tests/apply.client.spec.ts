import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { apply, inject } from '../src/client/index.ts'
import { ExpertsPanel } from '../src/client/ExpertsPanel.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register({ name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never, () => null)
  const appPanels = new AppPanelsController()
  ctx.provide('appPanels', appPanels)
  return { ctx, slots, appPanels }
}

describe('Experts plugin apply', () => {
  it('declares the slot and app-panel dependencies', () => {
    expect(inject).toEqual(['slots', 'appPanels'])
  })

  it('registers one persistent Experts overlay', async () => {
    const { ctx, slots, appPanels } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('shell.overlay')).toHaveLength(1) })
    const entry = slots.entries('shell.overlay')[0]!
    expect(entry.options.id).toBe('experts-panel')
    expect(entry.component).toBe(ExpertsPanel)
    expect((entry.inject as () => object)()).toEqual({ appPanels })
  })
})
