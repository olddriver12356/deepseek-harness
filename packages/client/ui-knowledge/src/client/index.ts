/**
 * Knowledge plugin, browser half: one persistent overlay reads the active
 * application panel and one frozen package fixture.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-shell/client'
import { KNOWLEDGE_FIXTURE } from './fixture.ts'
import { KnowledgePanel } from './KnowledgePanel.tsx'

export type {
  KnowledgeArtifact, KnowledgeArtifactState, KnowledgeLayer, KnowledgeLayerId, KnowledgeSnapshot,
} from './types.ts'
export { KNOWLEDGE_FIXTURE } from './fixture.ts'
export { KnowledgePanel } from './KnowledgePanel.tsx'

/** Required services: slot composition and active application-panel state. */
export const inject = ['slots', 'appPanels']

/** Register the persistent Knowledge overlay after the shell declares its slot. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'knowledge-panel',
      inject: () => ({ appPanels: ctx.appPanels, snapshot: KNOWLEDGE_FIXTURE }),
    },
    KnowledgePanel,
  ))
}
