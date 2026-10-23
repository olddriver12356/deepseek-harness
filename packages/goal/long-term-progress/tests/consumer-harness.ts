import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import CommandRuntime from '@deepseek-ai/dsh-commands'
import { createInboxStub } from '@deepseek-ai/dsh-agent-loop-testkit'
import { turnBoundaryProjectionDefinition } from '@deepseek-ai/dsh-agent-loop'
import { createUserMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LongTermProgress, { registerProgressCommand, registerProgressTools, registerProgressGoalTool } from '../src/index.ts'
import { checkpointId, milestoneId } from '../src/domain.ts'
import type { ProgressChange } from '../src/types.ts'

export const milestones = [{
  id: milestoneId('m1'), title: 'Foundation', caption: 'Durable state', exitCondition: 'Evidence verified',
  references: ['private-spec.md'], checkpoints: [{
    id: checkpointId('c1'), outcome: 'Private checkpoint outcome', detail: 'Private implementation', references: ['private-plan.md'],
  }],
}, {
  id: milestoneId('m2'), title: 'Delivery', caption: 'Ship verified work', exitCondition: 'Delivered',
  references: [], checkpoints: [{ id: checkpointId('c2'), outcome: 'Private shipping outcome', detail: '', references: [] }],
}]

export async function harness(includeTools = true) {
  const ctx = new Context()
  const disposers: (() => Promise<void>)[] = []
  onTestFinished(async () => { for (const dispose of disposers.reverse()) await dispose() })
  for (const plugin of [SessionStore, SessionProjectionRegistry, AgentRegistry, CommandRuntime, SystemPrompt, ToolRuntime, UserQuestions]) {
    const fiber = ctx.plugin(plugin)
    await fiber
    disposers.push(() => fiber.dispose())
  }
  ctx.sessionProjections.register(turnBoundaryProjectionDefinition)
  const fiber = ctx.plugin({ name: 'progress-with-consumers', inject: ['commands', 'tools', 'agents', 'sessionProjections'], async apply(owner: Context) {
    await owner.plugin(LongTermProgress)
    owner.inject(['longTermProgress'], (consumer) => {
      registerProgressCommand(consumer)
      if (includeTools) {
        registerProgressTools(consumer)
        registerProgressGoalTool(consumer)
      }
    })
  } })
  await fiber
  disposers.push(() => fiber.dispose())
  const session = ctx.sessions.create(SessionId(randomUUID()))
  const agent: Agent = {
    id: session.id, session, ctx, options: {}, inbox: createInboxStub(), status: 'running',
    send() {}, wake() {}, followup() {}, steer() {}, inject(input) { this.inbox.append('next-step', input) },
    cancel() {}, runMaintenance: task => task(new AbortController().signal), whenIdle: async () => {},
  }
  await ctx.agents.register(agent)
  const change = (action: ProgressChange) => ctx.longTermProgress.change(agent,
    { revision: ctx.longTermProgress.get(agent)?.revision ?? 0 }, action, { kind: 'human', source: 'command' })
  const command = async (input = '') => {
    const run = await ctx.commands.execute(agent, `/long-goal ${input}`, [], new AbortController().signal)
    if (run === undefined) throw new Error('long-goal command is unavailable')
    return run.result
  }
  const tool = (name: string, args: unknown, signal = new AbortController().signal) => ctx.agents.withInitiator(agent,
    () => ctx.tools.execute({ name, arguments: args, agent, callId: ToolCallId(randomUUID()), signal }))
  const open = (turn = 1, human = true) => {
    session.append('turn/start', { turn })
    if (human) session.append('user/message', createUserMessage({ content: [{ type: 'text', text: 'Continue' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  }
  return { ctx, agent, session, change, command, tool, open, fiber }
}
