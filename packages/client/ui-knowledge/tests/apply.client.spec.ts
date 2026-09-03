import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { apply, inject } from '../src/client/index.ts'
import { KNOWLEDGE_FIXTURE } from '../src/client/fixture.ts'
import { KnowledgePanel } from '../src/client/KnowledgePanel.tsx'

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  const appPanels = new AppPanelsController()
  ctx.provide('appPanels', appPanels)
  return { ctx, slots, appPanels }
}

describe('Knowledge plugin apply', () => {
  it('declares the slot and app-panel dependencies', () => {
    expect(inject).toEqual(['slots', 'appPanels'])
  })

  it('registers one persistent overlay with only app panels and the frozen fixture', async () => {
    const { ctx, slots, appPanels } = await bench()
    await ctx.plugin({ inject: [...inject], apply }).await()
    await vi.waitFor(() => { expect(slots.entries('shell.overlay')).toHaveLength(1) })

    const entry = slots.entries('shell.overlay')[0]!
    expect(entry.options.id).toBe('knowledge-panel')
    expect(entry.component).toBe(KnowledgePanel)
    expect((entry.inject as () => object)()).toEqual({ appPanels, snapshot: KNOWLEDGE_FIXTURE })
  })

  it('removes its overlay registration on fiber teardown', async () => {
    const { ctx, slots } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    await vi.waitFor(() => { expect(slots.entries('shell.overlay')).toHaveLength(1) })

    await fiber.dispose()
    expect(slots.entries('shell.overlay')).toHaveLength(0)
  })
})
