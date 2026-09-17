import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'

/**
 * Open an unsent distillation draft in a separate session in the source workspace.
 * @param ctx - client services for session creation and the existing composer.
 * @param sourceId - original session whose persisted log is the evidence.
 * @param instruction - owner-review instructions containing the source reference.
 */
export async function openDistillationDraft(ctx: Context, sourceId: SessionId, instruction: string): Promise<void> {
  const source = ctx.sessions.list.getSnapshot().byId[sourceId]
  if (source?.cwd === undefined) throw new Error('Source session workspace is unavailable')
  const workspaces = ctx.workspaces.list.getSnapshot().items
  const workspace = workspaces.find(item => item.sessionIds.includes(sourceId))
    ?? workspaces.find(item => item.path === source.cwd)
  if (workspace === undefined) throw new Error('Register the source workspace before distilling this session')
  const id = await ctx.sessions.create({ workspaceId: workspace.workspaceId })
  const scope = ctx.sessions.scope(id)
  if (scope === undefined) throw new Error('Distillation session is not ready')
  ctx.conversation.input.for(scope).setDraft(instruction)
  ctx.sessions.open(id)
}
