import { expect, it } from 'vitest'
import { LayoutController } from '../src/client/service.ts'
import { LayoutController as UpstreamLayout } from '@deepseek-ai/dsh-client-ui-layout/client'
it('uses the upstream service contract without a competing local implementation', () => {
  expect(LayoutController).toBe(UpstreamLayout)
})
