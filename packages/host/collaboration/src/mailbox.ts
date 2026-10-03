/** Durable peer acceptance, recipient admission and restart reconciliation. */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { requireCollaborationAuthority } from './authority.ts'
import { framePeerMessage, peerSourceSchema, sendPeerRequestSchema } from './messages.ts'
import { applyDiscussionOperation, findRequestReceipt } from './state.ts'
import type { CollaborationStore } from './store.ts'
import type { DiscussionOperation, MessageReceipt, OutboxMessage, PeerMessageId, SendPeerRequest } from './types.ts'

/** Host-owned durable discussion service; acceptance never promises assistant completion. */
export class CollaborationMailbox {
  private readonly stopped = new AbortController()
  private readonly deliveries = new Map<SessionId, Promise<void>>()
  private readonly requested = new Set<SessionId>()
  private readonly releases: Array<() => void> = []

  /**
   * @param ctx - Host services and lifecycle.
   * @param store - durable aggregate.
   * @param maxFramedMessageBytes - explicit complete content bound.
   */
  constructor(private readonly ctx: Context, private readonly store: CollaborationStore, private readonly maxFramedMessageBytes: number) {
    this.releases.push(ctx.agents.registerInputPolicy('collaboration-peer', (agent, message) => {
      if (this.stopped.signal.aborted) return false
      requireCollaborationAuthority(agent.ctx)
      const parsed = peerSourceSchema.safeParse(message.source)
      if (!parsed.success) return false
      const source = parsed.data
      const row = store.read().outbox.find(item => item.id === source.messageId)
      if (row === undefined || row.recipient !== agent.session.id || row.sender !== source.senderSessionId
        || row.recipient !== source.recipientSessionId || row.connectionId !== source.connectionId
        || JSON.stringify(message.content) !== JSON.stringify(framePeerMessage(row, maxFramedMessageBytes).content)) return false
      const projection = ctx.sessionProjections.stateOf(agent.session, 'collaborationReceipts')
      const receipt = projection?.receipts.find(item => item.messageId === row.id && item.inputId === message.id)
      if (row.state === 'admitted' && projection?.turnOpen && receipt?.phase === 'started' && receipt.turn === projection.turn) return true
      const pair = store.read().connections.find(item => item.id === row.connectionId)
      if ((row.state !== 'queued' && row.state !== 'admitted') || pair === undefined
        || !pair.sessions.includes(row.sender) || !pair.sessions.includes(row.recipient)) return false
      if (receipt?.phase === 'pending' && (pair.paused || row.state === 'queued')) return 'defer'
      return row.state === 'admitted' && !pair.paused
    }))
    this.releases.push(ctx.on('agent/status', ({ agent, status }) => { if (status === 'idle') this.schedule(agent.session.id) }))
    this.releases.push(ctx.on('agent/created', () => { this.recover(); return undefined }))
    this.releases.push(ctx.on('domain/changed', () => { this.recover() }))
    this.recover()
  }

  /**
   * Accept one sender-scoped request durably before scheduling any recipient activity.
   * @param caller - actual live Host Agent from tool execution, never model JSON.
   * @param request - strict peer message data with stable retry identity.
   * @returns original durable acceptance receipt, also on identical retries.
   */
  async send(caller: Agent, request: SendPeerRequest): Promise<MessageReceipt> {
    this.stopped.signal.throwIfAborted()
    requireCollaborationAuthority(caller.ctx)
    if (this.ctx.agents.get(caller.id) !== caller || caller.session.header.origin === 'subagent') throw new Error('peer sender must be the live ordinary acting session')
    const input = sendPeerRequestSchema.parse(request)
    const actor = { kind: 'session' as const, sessionId: caller.session.id }
    while (true) {
      const state = this.store.read()
      const original = findRequestReceipt(state, actor, input.requestId)
      if (original !== undefined) {
        const operation = original.operation
        if (operation.kind !== 'enqueue' || operation.message.connectionId !== input.connectionId || operation.message.text !== input.text) {
          throw new RemoteError('collaboration/request-conflict', 'request key already names different peer data', { requestId: input.requestId })
        }
        this.schedule(operation.message.recipient)
        return { messageId: operation.message.id, revision: original.result.revision, state: 'queued' }
      }
      const pair = state.connections.find(row => row.id === input.connectionId && row.sessions.includes(caller.session.id))
      if (pair === undefined || pair.paused) throw new Error('peer connection is absent or paused')
      const recipient = pair.sessions[0] === caller.session.id ? pair.sessions[1] : pair.sessions[0]
      const message: OutboxMessage = { id: brandString<PeerMessageId>(randomUUID()), connectionId: pair.id,
        sender: caller.session.id, recipient, text: input.text, state: 'queued' }
      framePeerMessage(message, this.maxFramedMessageBytes)
      try {
        const next = await this.store.transact(state.revision, current => applyDiscussionOperation(current, { kind: 'enqueue', message },
          { actor, requestId: input.requestId, timestamp: new Date().toISOString() }))
        this.schedule(recipient)
        return { messageId: message.id, revision: next.revision, state: 'queued' }
      } catch (error) {
        if (error instanceof RemoteError && error.code === 'collaboration/revision-conflict') continue
        throw error
      }
    }
  }

  /** Reschedule committed pending work; callers need not supply or reconstruct message bodies. */
  recover(): void {
    if (this.stopped.signal.aborted) return
    for (const row of this.store.read().outbox) if (row.state === 'queued' || row.state === 'admitted') this.schedule(row.recipient)
  }

  /** @returns completion of currently scheduled mailbox work, excluding model execution. */
  async whenSettled(): Promise<void> { while (this.deliveries.size > 0) await Promise.all(this.deliveries.values()) }

  /** @returns quiescence after stopping admission, unregistering effects, and draining owned delivery jobs. */
  async close(): Promise<void> {
    this.stopped.abort(new Error('collaboration mailbox disposed'))
    for (const release of this.releases.splice(0).reverse()) release()
    await this.whenSettled()
  }

  private authorized(row: OutboxMessage): boolean {
    const pair = this.store.read().connections.find(pair => pair.id === row.connectionId)
    return (row.state === 'queued' || row.state === 'admitted') && pair !== undefined && !pair.paused
      && pair.sessions.includes(row.sender) && pair.sessions.includes(row.recipient)
  }

  private message(id: PeerMessageId): OutboxMessage {
    const row = this.store.read().outbox.find(item => item.id === id)
    if (row === undefined) throw new Error('retained outbox message is absent')
    return row
  }

  private schedule(recipient: SessionId): void {
    if (this.stopped.signal.aborted) return
    if (this.deliveries.has(recipient)) { this.requested.add(recipient); return }
    const job = this.deliver(recipient).catch((error: unknown) => {
      // Failed wake retains durable queued work for explicit recovery or a later lifecycle change.
      if (!this.stopped.signal.aborted) this.ctx.logger.warn('peer delivery remains queued: %s', String(error))
    }).finally(() => {
      this.deliveries.delete(recipient)
      if (this.requested.delete(recipient)) this.schedule(recipient)
    })
    this.deliveries.set(recipient, job)
  }

  private async update(operation: DiscussionOperation): Promise<void> {
    while (true) {
      this.stopped.signal.throwIfAborted()
      const state = this.store.read()
      try {
        await this.store.transact(state.revision, current => applyDiscussionOperation(current, operation,
          { actor: { kind: 'system' }, timestamp: new Date().toISOString() }))
        return
      } catch (error) {
        if (error instanceof RemoteError && error.code === 'collaboration/revision-conflict') continue
        throw error
      }
    }
  }

  private async deliver(recipient: SessionId): Promise<void> {
    requireCollaborationAuthority(this.ctx)
    let agent = this.ctx.agents.get(recipient)
    if (agent === undefined) {
      const resolver = this.ctx.get('sessionController')
      if (resolver === undefined) throw new Error('ordinary session resolver is unavailable')
      const result = await resolver.resolveAgent(recipient)
      if ('error' in result) throw result.error
      agent = result.agent
    }
    this.stopped.signal.throwIfAborted()
    requireCollaborationAuthority(agent.ctx)
    if (agent.session.header.origin === 'subagent') throw new Error('recipient must be an ordinary session')
    if (agent.status !== 'idle') return
    const target = agent
    await target.runMaintenance(async (signal) => {
      const active = () => !signal.aborted && !this.stopped.signal.aborted && this.ctx.agents.get(recipient) === target
      for (const saved of this.store.read().outbox.filter(row => row.recipient === recipient && (row.state === 'queued' || row.state === 'admitted'))) {
        if (!active()) return
        let row = this.message(saved.id)
        const receipt = this.ctx.sessionProjections.stateOf(target.session, 'collaborationReceipts')?.receipts.find(item => item.messageId === row.id)
        const pending = [...target.inbox.nextTurn, ...target.inbox.nextStep].find(message =>
          message.id === receipt?.inputId && message.source.kind === 'collaboration-peer' && message.source.messageId === row.id)
        if (row.state === 'admitted') {
          if (pending !== undefined && this.authorized(row)) this.wakeWithHumanPriority(target)
          continue
        }
        if (receipt !== undefined) {
          if (pending === undefined) {
            if (receipt.phase === 'refused' || receipt.phase === 'cancelled') await this.update({ kind: 'settle', messageId: row.id, state: 'failed' })
            continue
          }
          await this.ctx.sessionPersistence.flush()
          if (active() && this.authorized(row)) {
            await this.update({ kind: 'admit', messageId: row.id })
            if (active() && this.authorized(this.message(row.id))) this.wakeWithHumanPriority(target)
          }
          continue
        }
        if (!this.authorized(row) || target.inbox.nextTurn.length > 0 || target.inbox.nextStep.some(item => item.source.kind === 'user')) return
        if (row.activationReserved !== true) await this.update({ kind: 'reserve-activation', messageId: row.id })
        row = this.message(row.id)
        if (!active() || !this.authorized(row) || target.inbox.nextTurn.length > 0 || target.inbox.nextStep.some(item => item.source.kind === 'user')) return
        requireCollaborationAuthority(target.ctx)
        target.inbox.append('next-turn', framePeerMessage(row, this.maxFramedMessageBytes))
        await this.ctx.sessionPersistence.flush()
        if (active() && this.authorized(this.message(row.id))) {
          await this.update({ kind: 'admit', messageId: row.id })
          if (active() && this.authorized(this.message(row.id))) this.wakeWithHumanPriority(target)
        }
        return
      }
    })
  }

  private wakeWithHumanPriority(target: Agent): void {
    const pending = target.inbox.nextTurn
    const eligible = (message: (typeof pending)[number]) => message.source.kind === 'user' || message.source.kind === 'collaboration-peer'
    const ordered = [...pending.filter(message => message.source.kind === 'user'),
      ...pending.filter(message => message.source.kind === 'collaboration-peer')]
    let cursor = 0
    const desired = pending.map(message => eligible(message) ? ordered[cursor++] ?? message : message)
    // Keep neutral context at its original position and each source class in FIFO order.
    for (const [index, message] of desired.entries()) target.inbox.move(message.id, index)
    target.wake()
  }
}
