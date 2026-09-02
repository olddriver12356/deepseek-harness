/**
 * Active-panel service spec: the observable contract the rail and every panel
 * occupant share. Panel visibility is a subscription, never a slot election,
 * so nothing here disposes or remounts anything.
 */
import { describe, expect, it, vi } from 'vitest'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'

describe('AppPanelsController', () => {
  it('starts on agent', () => {
    const panels = new AppPanelsController()

    expect(panels.getSnapshot()).toBe('agent')
  })

  it('updates the snapshot and notifies once when the active panel changes', () => {
    const panels = new AppPanelsController()
    const listener = vi.fn()
    panels.subscribe(listener)

    panels.setActive('news')

    expect(panels.getSnapshot()).toBe('news')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('does not notify when the active panel stays agent', () => {
    const panels = new AppPanelsController()
    const listener = vi.fn()
    panels.subscribe(listener)

    panels.setActive('agent')

    expect(listener).not.toHaveBeenCalled()
  })

  it('stops notifications after unsubscribe', () => {
    const panels = new AppPanelsController()
    const listener = vi.fn()
    const unsubscribe = panels.subscribe(listener)
    unsubscribe()

    panels.setActive('news')

    expect(listener).not.toHaveBeenCalled()
  })
})
