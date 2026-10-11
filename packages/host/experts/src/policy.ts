/** Durable expert delegation policy, enforced before every tool execution. */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'

const policySchema = z.object({
  childId: z.string(),
  expertId: z.string(),
  access: z.enum(['read-only', 'write']),
  allowedTools: z.array(z.string()),
})
/**
 * Durable child-specific tool grant restored before Expert execution.
 */
export type ExpertPolicy = z.infer<typeof policySchema>

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Immutable tool authority for one expert child. Log-only; persona describes it to the model. */
    'experts/delegation': ExpertPolicy
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Last delegation policy; childId prevents a fork from borrowing its parent's grant. */
    expertDelegation: ExpertPolicy | null
  }
}

/**
 * Install the Expert projection and tool guards for fresh and restored children.
 * @param ctx - Context providing Session projections and Agent lifecycle events.
 * @param pending - Caller-owned child policies awaiting durable admission.
 */
export function installExpertPolicy(ctx: Context, pending: ReadonlyMap<SessionId, ExpertPolicy>): void {
  ctx.sessionProjections.register({
    key: 'expertDelegation', stateVersion: 1, stateSchema: policySchema.nullable(),
    init: () => null,
    apply: (state, event) => event.type === 'experts/delegation' ? policySchema.parse(event.data) : state,
  })
  ctx.on('agent/created', ({ agent }) => {
    const admitted = pending.get(agent.id)
    if (admitted !== undefined) agent.session.append('experts/delegation', admitted)
    const policy = expertPolicyOf(ctx, agent)
    if (policy === undefined) return
    const allowed = new Set(policy.allowedTools)
    // Native tools keep program execution and further delegation out of the approved list.
    agent.ctx.tools.presentAs('native')
    agent.ctx.tools.guard(exec => allowed.has(exec.name)
      ? undefined : 'Expert delegation does not allow this tool; return the limitation to the parent.')
    agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const assembly = await next()
      return { ...assembly, tools: assembly.tools.filter(tool => allowed.has(tool.name)) }
    })
  })
}

/**
 * Read the grant belonging to this exact child instead of an inherited parent grant.
 * @param ctx - Context providing Session projections.
 * @param agent - Child Agent to inspect.
 * @returns Matching delegation grant, or undefined for an ordinary Agent.
 */
export function expertPolicyOf(ctx: Context, agent: Agent): ExpertPolicy | undefined {
  const policy = ctx.sessionProjections.stateOf(agent.session, 'expertDelegation')
  return policy?.childId === agent.id ? policy : undefined
}
