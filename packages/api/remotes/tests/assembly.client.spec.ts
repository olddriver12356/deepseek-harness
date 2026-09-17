import { expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { apply } from '../src/client/index.ts'

it('mounts each selected Remote once and disposes in reverse order', async () => {
  const mounted: unknown[] = []
  const disposed: unknown[] = []
  const ctx = {
    remote: {
      async $mount(contribution: unknown) {
        expect(mounted).not.toContain(contribution)
        mounted.push(contribution)
        return async () => { disposed.push(contribution) }
      },
    },
  } as unknown as Context
  const dispose = await apply(ctx)
  expect(mounted.length).toBeGreaterThan(0)
  await dispose()
  expect(disposed).toEqual([...mounted].reverse())
})
