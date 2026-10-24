/** Human-only context reset using the durable Session surface replacement seam. */
import type { Context } from '@deepseek-ai/cordis'
import { reference } from './reference.ts'
import { conversationClearProjection } from './projection.ts'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createSystemMessage } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-compaction'
import type {} from '@deepseek-ai/dsh-goal'
import type {} from '@deepseek-ai/dsh-token-meter'

export const name = 'command-clear'
export const inject = ['commands', 'sessions', 'tokenMeter', 'sessionProjections']

/** Replace conversation nodes, preserving the protected system head and raw log. */
function clearSurface(ctx: Context, agent: Agent): void {
  const session = agent.session
  const nodes = [...session.surface.nodes]
  const events = session.snapshotEvents()
  const head = nodes[0]
  const retained = head !== undefined && events[head]?.type === 'system/message' ? 1 : 0
  const removed = nodes.slice(retained)
  const start = removed[0]
  const end = removed.at(-1)
  if (start === undefined || end === undefined) return
  const shadowedTokenCount = removed.reduce((total, seq) => {
    const event = events[seq]
    if (event === undefined) throw new Error(`Missing surface event ${seq}`)
    const message = session.deriveEventMessage(event)
    return total + (message === null ? 0 : ctx.tokenMeter.estimateMessage(message))
  }, 0)
  // The empty system node has no wire message. The adjacent prune prices exactly
  // this replacement for context-pressure consumers, including replay.
  session.append('compaction/prune', {
    shadowedRange: { start, end }, shadowedSeqs: removed, shadowedTokenCount,
  })
  session.append('system/message', {
    turn: events.findLast(event => event.type === 'turn/start')?.data.turn ?? 1,
    step: 1, message: createSystemMessage(''),
  }, {
    surfaceOp: { op: 'replace', startSeq: start, endSeq: end },
    sourceEventSeqs: removed,
  })
}

/** Register the global command; only the invocation's receiving Agent is reset. */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(conversationClearProjection)
  const active = new Set<Promise<CommandResult>>()
  const execute = async ({ agent, rawInput, signal }: CommandInvocation): Promise<CommandResult> => {
    if (rawInput.trim() !== '') return { kind: 'error', text: 'Usage: /clear (no arguments)' }
    signal.throwIfAborted()
    let entered = false
    try {
      return await agent.runMaintenance(async (maintenanceSignal) => {
        entered = true
        signal.throwIfAborted()
        maintenanceSignal.throwIfAborted()
        const goals = ctx.get('goals')
        const goal = goals?.get(agent)
        if (goal !== undefined) goals?.clear(agent, { id: goal.id, revision: goal.revision })
        agent.inbox.clear()
        clearSurface(ctx, agent)
        try { await ctx.sessions.flush(agent.session) }
        catch (error: unknown) {
          return { kind: 'error', text: `Context was cleared in memory, but saving failed: ${error instanceof Error ? error.message : String(error)}. Do not assume the reset survived a restart.` }
        }
        return { kind: 'success', text: 'Conversation context cleared. Continue in this Session with a fresh conversation. System instructions, tools and settings are retained; the previous transcript remains available for audit.' }
      })
    } catch (error: unknown) {
      if (entered || signal.aborted) throw error
      return { kind: 'error', text: 'Cannot clear while this Session has active work. Stop it or wait until it is idle, then retry /clear.' }
    }
  }
  ctx.effect(function* () {
    yield async () => { await Promise.allSettled(active) }
    yield ctx.commands.register({
      definitionId: CommandDefinitionId('local/command-clear'),
      name: 'clear', reference,
      description: 'Clear conversation context and reuse this Session',
      handler: (invocation) => {
        const operation = execute(invocation)
        active.add(operation)
        void operation.then(() => { active.delete(operation) }, () => { active.delete(operation) })
        return operation
      },
    })
  }, 'command-clear lifecycle')
}
