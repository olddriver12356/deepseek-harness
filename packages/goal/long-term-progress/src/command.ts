/** Human slash-command adapter; saving and release never schedule execution. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { compactProgress } from './context.ts'
import { milestoneId, ProgressError, progressChangeSchema } from './domain.ts'
import type { ProgressChange } from './types.ts'

const usage = 'Usage: /long-goal [status|draft <revision> <milestones JSON>|approve <id> <revision>|start <id> <revision>|accept <id> <revision>]'

/** Register the human-only command against the receiving Agent's state.
 * @param ctx - owning context with command and progress services. */
export function registerProgressCommand(ctx: Context): void {
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-long-term-progress'),
    name: 'long-goal', description: 'View and maintain this Session’s long-term milestones',
    input: { hint: '[status|draft <revision> <JSON>|approve|start|accept <id> <revision>]' }, recordInput: false,
    handler: (invocation) => {
      try {
        invocation.signal.throwIfAborted()
        const input = invocation.rawInput.trim()
        const current = ctx.longTermProgress.get(invocation.agent)
        if (input === '' || input === 'status') return {
          kind: 'success', text: current === null ? `No long-term progress is set.\n${usage}` : JSON.stringify(compactProgress(current), null, 2),
        }
        let revision: number
        let change: ProgressChange
        const draft = /^draft\s+(\d+)\s+([\s\S]+)$/u.exec(input)
        const decision = /^(approve|start|accept)\s+(\S+)\s+(\d+)$/u.exec(input)
        if (draft !== null) {
          revision = Number(draft[1])
          const milestones: unknown = JSON.parse(z.string().parse(draft[2]))
          const parsed = progressChangeSchema.parse({ kind: 'replace', milestones })
          if (parsed.kind !== 'replace') throw new ProgressError('draft requires milestones')
          change = parsed
        } else if (decision !== null) {
          revision = Number(decision[3])
          const parsed = progressChangeSchema.parse({ kind: decision[1], milestoneId: milestoneId(z.string().parse(decision[2])) })
          if (parsed.kind !== 'approve' && parsed.kind !== 'start' && parsed.kind !== 'accept')
            throw new ProgressError('invalid milestone decision')
          change = parsed
        } else return { kind: 'error', text: usage }
        const state = ctx.longTermProgress.change(invocation.agent, { revision }, change, { kind: 'human', source: 'command' })
        return { kind: 'success', text: JSON.stringify(compactProgress(state), null, 2) } satisfies CommandResult
      } catch (error) {
        if (error instanceof ProgressError || error instanceof z.ZodError || error instanceof SyntaxError)
          return { kind: 'error', text: `${error.message}\n${usage}` }
        throw error
      }
    },
  })
}
