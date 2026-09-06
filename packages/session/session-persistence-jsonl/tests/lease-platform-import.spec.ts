/** Windows imports must not require the POSIX-only native addon. */
import { expect, it, vi } from 'vitest'

vi.mock('fs-ext', () => {
  throw new Error('POSIX addon is unavailable')
})

it('loads the lease module without loading the POSIX addon', async () => {
  await expect(import('../src/lease.ts')).resolves.toHaveProperty('SessionWriteLease')
})
