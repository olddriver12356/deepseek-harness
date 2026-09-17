// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { createLayoutStore } from '../src/client/stores.ts'
import { createLayoutStore as upstreamStore } from '@deepseek-ai/dsh-client-ui-layout/client'
it('shares the upstream main-panel and rightbar geometry store', () => {
  expect(createLayoutStore).toBe(upstreamStore)
  const store = createLayoutStore().create()
  store.actions.toggleSidebar()
  expect(store.getSnapshot().layoutInfo.sidebar).toBe(0)
  expect(store.getSnapshot().panelInfo.activePanelId).toBeNull()
})
