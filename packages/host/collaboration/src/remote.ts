/** Authenticated UI Remote adapter for V1a discussion controls and filtered committed views. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { Remote, RemoteError, remoteErrorOf, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import { createHumanControlAdmission } from './authority.ts'
import { collaborationStateSchema, connectionIdSchema, requestIdSchema, sessionIdSchema } from './schema.ts'
import { applyDiscussionOperation, findRequestReceipt } from './state.ts'
import type {
  AddPeerRequest, CollaborationActor, CollaborationMutationResult, CollaborationSnapshot, CollaborationState,
  CollaborationViewRequest, DiscussionOperation, PeerBudgetRequest, PeerControlRequest, Registration, RequestReceipt,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Authenticated UI controls; discussion admission never enters JSON. */
    collaborationRemote: CollaborationRemote
  }
}


const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const mutationFields = { sessionId: sessionIdSchema, expectedRevision: count, requestId: requestIdSchema }
const pairFields = { ...mutationFields, connectionId: connectionIdSchema }
const controlSchema = z.strictObject(pairFields)
const budgetSchema = z.strictObject({ ...pairFields, limit: count })
const viewSchema = z.strictObject({ sessionId: sessionIdSchema })
const addSchema = z.strictObject({
  ...mutationFields, peerSessionId: sessionIdSchema, title: z.string(), peerTitle: z.string(),
  cwd: z.string().min(1), peerCwd: z.string().min(1), disclosureAccepted: z.literal(true),
  grants: z.strictObject({ snapshot: z.boolean(), follow: z.boolean() }), activationLimit: count,
}).refine(request => request.sessionId !== request.peerSessionId, 'peer must be a distinct session')

/** Owns the generated collaboration Remote namespace; Connection authenticates its wire transport. */
export class CollaborationRemote extends TypertRemoteService {
  static inject = ['collaborationStore', 'sessionPersistence']
  private readonly followers = new Set<() => void>()
  private disposed = false

  /** @param ctx - Host context with durable collaboration storage and metadata-only Session browsing. */
  constructor(ctx: Context) {
    super(ctx, 'collaborationRemote', { namespace: 'collaboration' })
    ctx.effect(() => () => {
      this.disposed = true
      for (const close of this.followers) close()
      this.followers.clear()
    }, 'collaboration.remote-followers')
  }

  /**
   * Register both ordinary Sessions and grant their bidirectional connection in one durable transition.
   * Retries compare original caller intent before refreshing headers or generating another pair identity.
   * @param request - explicit UI disclosure, labels, observed workspaces, grants, budget, revision and retry key.
   * @returns the original committed receipt, also for a concurrent identical retry.
   */
  @Remote
  async addPeer(request: AddPeerRequest): Promise<CollaborationMutationResult> {
    const intent = parse(addSchema, request)
    const actor: CollaborationActor = { kind: 'human', sessionId: intent.sessionId }
    const retry = () => this.addReceipt(intent, actor)
    const original = retry()
    if (original !== undefined) return original.result
    const [initiator, peer] = await Promise.all([
      this.registration(intent.sessionId, intent.title, intent.cwd),
      this.registration(intent.peerSessionId, intent.peerTitle, intent.peerCwd),
    ])
    const operation: DiscussionOperation = {
      kind: 'add-peer', registrations: [initiator, peer],
      connection: { id: connectionIdSchema.parse(randomUUID()), sessions: [initiator.sessionId, peer.sessionId],
        disclosureAccepted: true, grants: intent.grants, budget: { limit: intent.activationLimit, used: 0 }, paused: false },
    }
    return this.commit(intent, operation, retry)
  }

  /**
   * Revoke the pair and cancel its unadmitted work in one durable transition; admitted work remains recorded.
   * @param request - owned pair, expected revision and stable request key.
   * @returns original disconnect receipt; disconnection does not undo recipient input.
   */
  @Remote
  removePeer(request: PeerControlRequest): Promise<CollaborationMutationResult> {
    return this.control(parse(controlSchema, request), 'disconnect')
  }

  /**
   * Stop new peer activations without revoking the pair's record-view grants.
   * @param request - owned pair, expected revision and stable request key.
   * @returns original committed receipt.
   */
  @Remote
  pause(request: PeerControlRequest): Promise<CollaborationMutationResult> {
    return this.control(parse(controlSchema, request), 'pause')
  }

  /**
   * Allow new peer activations within the existing explicit budget.
   * @param request - owned pair, expected revision and stable request key.
   * @returns original committed receipt.
   */
  @Remote
  resume(request: PeerControlRequest): Promise<CollaborationMutationResult> {
    return this.control(parse(controlSchema, request), 'resume')
  }

  /**
   * Replace the pair's activation limit without refunding already charged activations.
   * @param request - owned pair, total limit, expected revision and stable request key.
   * @returns original committed receipt.
   */
  @Remote
  budget(request: PeerBudgetRequest): Promise<CollaborationMutationResult> {
    const intent = parse(budgetSchema, request)
    return this.mutate(intent, { kind: 'budget', connectionId: intent.connectionId, limit: intent.limit })
  }

  /**
   * Read only collaboration records for the viewer's pairs with snapshot grants; no Session log is read.
   * @param request - ordinary stored viewing Session.
   * @returns a complete filtered committed view with its aggregate revision.
   */
  @Remote
  async snapshot(request: CollaborationViewRequest): Promise<CollaborationSnapshot> {
    const intent = parse(viewSchema, request)
    await this.ordinaryHeader(intent.sessionId)
    return project(this.ctx.collaborationStore.read(), intent.sessionId, 'snapshot')
  }

  /**
   * Stream an initial filtered snapshot and complete committed revision views; gaps require no authority cache.
   * Slow readers coalesce pending views to the latest full snapshot. Disposal ends every active generation.
   * @param request - ordinary stored viewing Session; follow grants filter every item anew.
   * @param signal - Remote generation cancellation.
   * @returns complete snapshots of committed state only, including grant revocation and disconnection.
   */
  @Remote({ mode: 'stream' })
  async *follow(request: CollaborationViewRequest, signal: AbortSignal): AsyncIterable<CollaborationSnapshot> {
    const intent = parse(viewSchema, request)
    signal.throwIfAborted()
    await this.ordinaryHeader(intent.sessionId)
    if (this.disposed) return
    let pending: CollaborationState | undefined
    const takePending = (): CollaborationState | undefined => {
      const state = pending
      pending = undefined
      return state
    }
    let wake: (() => void) | undefined
    const lifetime = new AbortController()
    const unsubscribe = this.ctx.on('domain/changed', (change) => {
      if (change.domain !== 'collaboration' || change.table !== 'state' || change.key !== 'current' || change.operation !== 'put') return
      pending = collaborationStateSchema.parse(change.value)
      wake?.()
    })
    const close = () => {
      lifetime.abort()
      unsubscribe()
      signal.removeEventListener('abort', close)
      this.followers.delete(close)
      wake?.()
    }
    this.followers.add(close)
    signal.addEventListener('abort', close, { once: true })
    try {
      pending = this.ctx.collaborationStore.read()
      while (!lifetime.signal.aborted && !signal.aborted) {
        const state = takePending()
        if (state !== undefined) {
          yield project(state, intent.sessionId, 'follow')
        } else {
          await new Promise<void>((resolve) => { wake = resolve })
          wake = undefined
        }
      }
    } finally {
      close()
    }
  }

  private control(request: PeerControlRequest, kind: 'disconnect' | 'pause' | 'resume'): Promise<CollaborationMutationResult> {
    const operation: DiscussionOperation = kind === 'disconnect' ? { kind, connectionId: request.connectionId }
      : { kind: 'pause', connectionId: request.connectionId, paused: kind === 'pause' }
    return this.mutate(request, operation)
  }

  private async mutate(request: PeerControlRequest, operation: DiscussionOperation): Promise<CollaborationMutationResult> {
    const actor: CollaborationActor = { kind: 'human', sessionId: request.sessionId }
    const retry = () => findRequestReceipt(this.ctx.collaborationStore.read(), actor, request.requestId, operation)
    const original = retry()
    if (original !== undefined) return original.result
    await this.ordinaryHeader(request.sessionId)
    return this.commit(request, operation, retry)
  }

  private async commit(
    request: PeerControlRequest | AddPeerRequest, operation: DiscussionOperation, retry: () => RequestReceipt | undefined,
  ): Promise<CollaborationMutationResult> {
    const actor: CollaborationActor = { kind: 'human', sessionId: request.sessionId }
    try {
      const state = await this.ctx.collaborationStore.transact(request.expectedRevision, (current) => {
        if ('connectionId' in operation) {
          const pair = current.connections.find(row => row.id === operation.connectionId)
          if (pair !== undefined && !pair.sessions.includes(request.sessionId)) {
            throw new RemoteError('collaboration/unauthorized', 'Select a connection belonging to this session, then retry.', { sessionId: request.sessionId })
          }
        }
        return applyDiscussionOperation(current, operation, { actor, requestId: request.requestId,
          timestamp: new Date().toISOString(), admission: createHumanControlAdmission('discussion') })
      })
      const receipt = findRequestReceipt(state, actor, request.requestId)
      if (receipt === undefined) throw new Error('committed collaboration mutation has no request receipt')
      return receipt.result
    } catch (error) {
      if (remoteErrorOf(error)?.code !== 'collaboration/revision-conflict') throw error
      const receipt = retry()
      if (receipt !== undefined) return receipt.result
      throw error
    }
  }

  private addReceipt(request: AddPeerRequest, actor: CollaborationActor): RequestReceipt | undefined {
    const receipt = findRequestReceipt(this.ctx.collaborationStore.read(), actor, request.requestId)
    if (receipt === undefined) return undefined
    const operation = receipt.operation
    if (operation.kind !== 'add-peer'
      || operation.connection.sessions[0] !== request.sessionId || operation.connection.sessions[1] !== request.peerSessionId
      || operation.registrations[0].title !== request.title || operation.registrations[1].title !== request.peerTitle
      || !samePath(operation.registrations[0].cwd, request.cwd) || !samePath(operation.registrations[1].cwd, request.peerCwd)
      || operation.connection.budget.limit !== request.activationLimit
      || operation.connection.grants.snapshot !== request.grants.snapshot || operation.connection.grants.follow !== request.grants.follow) {
      throw new RemoteError('collaboration/request-conflict', 'The request key already names different connection intent. Use a new request key.', { requestId: request.requestId })
    }
    return receipt
  }

  private async ordinaryHeader(sessionId: SessionId) {
    const snapshot = await this.ctx.sessionPersistence.stat(sessionId)
    const header = snapshot?.header
    if (header === undefined || header.id !== sessionId || header.origin === 'subagent' || (header.delegationDepth ?? 0) > 0) {
      const reason = header === undefined ? 'unknown session' : 'not an independently owned ordinary session'
      throw new RemoteError('collaboration/session-unavailable', `Select an existing ordinary session on this Host; ${reason}. Refresh the session list and retry.`, { sessionId, reason })
    }
    return header
  }

  private async registration(sessionId: SessionId, title: string, expectedCwd: string): Promise<Registration> {
    const header = await this.ordinaryHeader(sessionId)
    if (header.cwd === undefined || !isAbsolute(header.cwd) || !isAbsolute(expectedCwd) || !samePath(header.cwd, expectedCwd)) {
      throw new RemoteError('collaboration/workspace-mismatch', 'Session workspace is missing or changed. Refresh its workspace metadata, or select a session created in an explicit workspace, and retry.',
        { sessionId, ...(header.cwd === undefined ? {} : { actualCwd: header.cwd }) })
    }
    return { sessionId: header.id, title, cwd: header.cwd }
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new RemoteError('gateway/bad-request', 'Invalid collaboration request. Supply the declared fields and explicit limits; human authority cannot be supplied in JSON.', {})
  return result.data
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? resolve(left).toLowerCase() === resolve(right).toLowerCase() : resolve(left) === resolve(right)
}

function project(state: CollaborationState, sessionId: SessionId, grant: 'snapshot' | 'follow'): CollaborationSnapshot {
  const connections = state.connections.filter(row => row.sessions.includes(sessionId) && row.grants[grant])
  const endpoints = new Set(connections.flatMap(row => [...row.sessions]))
  const pairs = new Set(connections.map(row => row.id))
  return { revision: state.revision, connections, registrations: state.registrations.filter(row => endpoints.has(row.sessionId)),
    outbox: state.outbox.filter(row => pairs.has(row.connectionId)) }
}
