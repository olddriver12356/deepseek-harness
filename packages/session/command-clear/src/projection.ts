/** Whole-log clear boundary, available even when the clear command is outside a history page. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    conversationClear: { pending: string | null; throughSeq: number | null; hasActivity: boolean }
  }
  interface SessionProjectionMap {
    conversationClear: { throughSeq: number | null; hasActivity: boolean }
  }
}
const viewSchema = z.object({ throughSeq: z.number().int().nonnegative().nullable(), hasActivity: z.boolean() }).strict()
export const conversationClearProjection = {
  key: 'conversationClear', stateVersion: 1,
  stateSchema: viewSchema.extend({ pending: z.string().nullable() }),
  init: () => ({ pending: null, throughSeq: null, hasActivity: false }),
  apply: (state, event) => {
    if (event.type === 'command/run' && event.data.name === 'clear') return { ...state, pending: event.data.commandId }
    if (event.type === 'command/done' && event.data.commandId === state.pending) return {
      pending: null, throughSeq: event.data.kind === 'success' ? event.seq : state.throughSeq,
      hasActivity: event.data.kind === 'success' ? false : state.hasActivity,
    }
    if (!state.hasActivity && (event.type === 'user/message' && event.data.source.kind === 'user' || event.type === 'assistant/message')) return { ...state, hasActivity: true }
    return state
  },
  wire: { viewSchema, view: state => ({ throughSeq: state.throughSeq, hasActivity: state.hasActivity }) },
} satisfies ProjectionDefinition<'conversationClear'>
