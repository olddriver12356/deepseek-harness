// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { useEntranceMotion } from '../src/useEntranceMotion.ts'

const animation = vi.hoisted(() => ({ revert: vi.fn() }))
const animate = vi.hoisted(() => vi.fn(() => animation))
vi.mock('animejs', () => ({ animate, stagger: (delay: number) => delay }))
let reduced = false
const listeners = new Set<() => void>()
vi.stubGlobal('matchMedia', () => ({ get matches() { return reduced }, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) }))
function Surface({ active, revision = 0 }: { active: boolean; revision?: number }) {
  const ref = useEntranceMotion<HTMLDivElement>(active, revision)
  return <div ref={ref} hidden={!active}>Readable content</div>
}
afterEach(() => { vi.clearAllMocks(); reduced = false })

it('reverts completion only once, including StrictMode cleanup', () => {
  const view = render(<StrictMode><Surface active /></StrictMode>)
  expect(animate).toHaveBeenCalledTimes(2)
  const options = (animate.mock.calls as unknown as [unknown, { onComplete: (self: typeof animation) => void }][])[1]![1]
  act(() => { options.onComplete(animation) })
  view.unmount()
  expect(animation.revert).toHaveBeenCalledTimes(2)
  expect(listeners.size).toBe(0)
})

it('limits card entrances to eight visible marked descendants and preserves hover transforms', () => {
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const outside = this.dataset.outside !== undefined
    return { top: outside ? 2000 : 10, bottom: outside ? 2100 : 100, left: 10, right: 100, width: 90, height: 90 } as DOMRect
  })
  function Cards() {
    const ref = useEntranceMotion<HTMLDivElement>(true, 0, 'cards')
    return <div ref={ref}>
      <span data-entrance-card data-outside />
      {Array.from({ length: 10 }, (_, i) => <span key={i} data-entrance-card />)}<span />
    </div>
  }
  const view = render(<Cards />)
  const [targets, options] = (animate.mock.calls as unknown as [HTMLElement[], Record<string, unknown>][])[0]!
  expect(targets).toHaveLength(8)
  expect(targets.every(target => target.dataset.outside === undefined)).toBe(true)
  expect(options).not.toHaveProperty('translateY')
  expect(options).not.toHaveProperty('scale')
  expect(options.delay).toBe(25)
  view.unmount()
  bounds.mockRestore()
})
it('enters on activation but not ordinary data renders', () => {
  const view = render(<Surface active={false} />)
  expect(animate).not.toHaveBeenCalled()
  view.rerender(<Surface active />)
  expect(animate).toHaveBeenCalledTimes(1)
  view.rerender(<Surface active />)
  expect(animate).toHaveBeenCalledTimes(1)
  view.rerender(<Surface active revision={1} />)
  expect(animation.revert).toHaveBeenCalledTimes(1)
  expect(animate).toHaveBeenCalledTimes(2)
  view.unmount()
  expect(animation.revert).toHaveBeenCalledTimes(2)
})
it('keeps reduced-motion content visible without starting an animation', () => {
  reduced = true
  const view = render(<Surface active />)
  expect(animate).not.toHaveBeenCalled()
  expect(view.getByText('Readable content').hidden).toBe(false)
  view.unmount()
})
it('reverts an active animation when reduced motion is enabled', () => {
  const view = render(<Surface active />)
  act(() => { reduced = true; for (const fn of listeners) fn() })
  expect(animation.revert).toHaveBeenCalledTimes(1)
  view.unmount()
  expect(listeners.size).toBe(0)
})
