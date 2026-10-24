/** Human slash-command adapter; saving and release never schedule execution. */
import type { Context } from '@deepseek-ai/cordis'
import { reference } from './reference.ts'
import { z } from 'zod'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { compactProgress } from './context.ts'
import { milestoneId, ProgressError, progressChangeSchema } from './domain.ts'
import type { ProgressChange } from './types.ts'

const usage = 'Usage: /long-goal [status|draft <revision> <description>|approve <id> <revision>|start <id> <revision>|accept <id> <revision>]'

/** Register the human-only command against the receiving Agent's state.
 * @param ctx - owning context with command and progress services. */
export function registerProgressCommand(ctx: Context): void {
  ctx.commands.register({
    definitionId: CommandDefinitionId('@deepseek-ai/dsh-long-term-progress'),
    name: 'long-goal', reference, description: 'View and maintain this Session’s long-term milestones',
    input: { hint: '[status|draft <revision> <description>|approve|start|accept <id> <revision>]' }, recordInput: false,
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
          revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(Number(draft[1]))
          if (revision !== (current?.revision ?? 0)) throw new ProgressError('stale progress revision', 'PROGRESS_STALE')
          const description = z.string().trim().min(1).parse(draft[2])
          invocation.agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: [
            `Draft a long-term milestone/checkpoint proposal for this Session at progress revision ${revision}. This is a revision, not a round number.`,
            'Read existing progress as needed; preserve accepted history and stable IDs when revising. Ask concise questions if intent is unclear.',
            'Propose reasonable milestones and their corresponding verifiable checkpoints as a readable list, not JSON. Discuss requested revisions before saving.',
            `To save the exact proposal, use update_progress with revision ${revision} and change kind replace; its human confirmation must be approved before mutation.`,
            'Do not substitute a newer revision if progress changes during discussion; re-read, reconcile the proposal and seek fresh confirmation.',
            'This request authorizes drafting only. Do not approve, start or accept milestones, create or resume an execution Goal, or implement the project.',
            '', 'User description:', description,
          ].join('\n') }] }))
          return { kind: 'success', text: 'Draft request sent to this Session’s Agent. Review the proposed milestones and checkpoints; nothing is saved until you confirm.' }
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
