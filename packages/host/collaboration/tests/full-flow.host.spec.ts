import { it } from 'vitest'
import { runDiscussionFlow } from './discussion-flow.ts'

it('assembles independent discussion through shipped dsh Web and authenticated human controls', async (test) => {
  await runDiscussionFlow(test)
}, 120000)
