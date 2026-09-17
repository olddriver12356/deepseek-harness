// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { AppPanelsController } from '@deepseek-ai/dsh-client-ui-shell/src/client/app-panels.ts'
import { MonitorPanel } from '../src/client/MonitorPanel.tsx'

const { animationPath, animate } = await vi.hoisted(async () => {
  const { createRequire } = await import('node:module')
  const path = await import('node:path')
  const require = createRequire(path.resolve('packages/client/ui-primitives/package.json'))
  const manifest = require('animejs/package.json') as { module: string }
  return { animationPath: path.resolve(path.dirname(require.resolve('animejs/package.json')), manifest.module), animate: vi.fn(() => ({ revert: vi.fn() })) }
})
vi.mock(animationPath, () => ({ animate, stagger: (delay: number) => (_target: unknown, index: number) => delay * index }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('enters on activation while live projection updates remain immediate without replay', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  const appPanels = new AppPanelsController()
  const useConversation = () => undefined
  const view = render(<MonitorPanel appPanels={appPanels} useProjection={() => undefined} useConversation={useConversation} />)
  expect(animate).not.toHaveBeenCalled()
  act(() => { appPanels.setActive('monitor') })
  expect(animate).toHaveBeenCalledTimes(1)
  view.rerender(<MonitorPanel appPanels={appPanels} useProjection={(key: string) => key === 'contextPressure' ? { projectedTokens: 64_000, contextWindow: 128_000 } : undefined} useConversation={useConversation} />)
  expect(screen.getByText('上下文占用 50%')).toBeTruthy()
  expect(animate).toHaveBeenCalledTimes(1)
  act(() => { appPanels.setActive('news') })
  act(() => { appPanels.setActive('monitor') })
  expect(screen.getByText('上下文占用 50%')).toBeTruthy()
  expect(animate).toHaveBeenCalledTimes(2)
})
