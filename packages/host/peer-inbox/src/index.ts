/** Opt-in authenticated loopback ingress for explicitly allowed live root Sessions. @module @deepseek-ai/dsh-peer-inbox */
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { isAbsolute } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type MessageId } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Ledger, type Entry } from './ledger.ts'

/** Explicit deployment policy; loading this plugin enables the separate listener. */
export interface Config {
  /** Environment variable containing an ASCII bearer secret of at least 32 bytes. */
  tokenEnv: string
  /** IPv4 loopback port; zero requests an OS-assigned port. */
  port: number
  /** Absolute owner-private directory, never shared between running plugin instances. */
  ledgerDir: string
  /** Exact live root Session IDs the trusted owner relay may address. */
  allowedSessionIds: string[]
  /** Maximum complete incoming JSON bytes. */
  maxRequestBytes: number
  /** Maximum complete response JSON bytes; at least 512. */
  maxOutputBytes: number
  /** Maximum simultaneous HTTP requests. */
  maxConcurrentRequests: number
  /** Maximum queued or running relay requests. */
  maxPendingRequests: number
  /** Lifetime request tombstone capacity; entries are never evicted automatically. */
  maxLedgerEntries: number
  /** Maximum HTTP request lifetime in milliseconds. */
  requestTimeoutMs: number
  /** Maximum observation time per admitted request in milliseconds. */
  executionTimeoutMs: number
}
/** Loader configuration schema; all deployment choices are explicit. */
export const Config: z<Config> = z.object({
  tokenEnv: z.string().required(), port: z.number().min(0).max(65535).required(),
  ledgerDir: z.string().required(), allowedSessionIds: z.array(z.string()).required(),
  maxRequestBytes: z.number().min(1).required(), maxOutputBytes: z.number().min(512).required(),
  maxConcurrentRequests: z.number().min(1).required(), maxPendingRequests: z.number().min(1).required(),
  maxLedgerEntries: z.number().min(1).required(), requestTimeoutMs: z.number().min(1).required(),
  executionTimeoutMs: z.number().min(1).required(),
})
interface Pending {
  entry: Entry
  agent: Agent
  messageId: MessageId
  timer: ReturnType<typeof setTimeout>
  text?: string | undefined
  foreign: boolean
}
declare module '@deepseek-ai/cordis' { interface Context { peerInbox: PeerInbox } }
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'peer-inbox': { kind: 'peer-inbox' }
  }
}
class HttpError extends Error { constructor(readonly status: number, readonly code: string) { super(code) } }
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/

/** Listener lifecycle and request observation; never creates, resumes, steers, or cancels an Agent. */
export class PeerInbox extends Service {
  static inject = ['agents']
  static Config = Config
  /** Effective listening port, available after plugin activation. */
  port: number = 0
  private readonly runtimeId = randomUUID()
  private readonly pending = new Map<string, Pending>()
  private ledger!: Ledger
  private closing = false
  private broken = false
  private activeHttp = 0
  private readonly secret: Buffer
  private readonly server = createServer({ maxHeaderSize: 8192 }, (req, res) => { void this.handle(req, res) })

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'peerInbox')
    for (const value of [
      config.port, config.maxRequestBytes, config.maxOutputBytes, config.maxConcurrentRequests,
      config.maxPendingRequests, config.maxLedgerEntries, config.requestTimeoutMs, config.executionTimeoutMs,
    ]) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error('peer-inbox: invalid integer configuration')
    }
    if (!isAbsolute(config.ledgerDir) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.tokenEnv) || config.allowedSessionIds.length === 0 || new Set(config.allowedSessionIds).size !== config.allowedSessionIds.length || config.allowedSessionIds.some(id => !idPattern.test(id))) throw new Error('peer-inbox: invalid configuration')
    const token = process.env[config.tokenEnv]
    if (token === undefined || !/^[\x21-\x7e]{32,4096}$/.test(token)) throw new Error('peer-inbox: bearer secret must contain at least 32 ASCII bytes')
    this.secret = Buffer.from(token)
    ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
      for (const pending of this.pending.values()) {
        if (pending.agent !== agent) continue
        if (pending.messageId === message.id) {
          pending.entry.result = { requestId: pending.entry.result.requestId, status: 'running', turn }
          this.save(pending.entry)
        } else if (pending.entry.result.turn === turn) {
          pending.foreign = true
          pending.text = undefined
        }
      }
    })
    ctx.on('agent/inbox/discarded', ({ agent, message }) => {
      const pending = [...this.pending.values()].find(p => p.agent === agent && p.messageId === message.id)
      if (pending !== undefined) this.settle(pending, 'failed', 'discarded')
    })
    ctx.on('agent/disposed', ({ agent }) => {
      for (const pending of [...this.pending.values()]) if (pending.agent === agent) this.settle(pending, 'unknown', 'session_disposed')
    })
    ctx.on('session/event', (session, event) => {
      for (const pending of [...this.pending.values()]) {
        if (pending.agent.session !== session || pending.entry.result.turn === undefined) continue
        if (event.type === 'user/message' && event.data.id !== pending.messageId) {
          pending.foreign = true
          pending.text = undefined
        }
        if (event.type === 'assistant/message' && event.data.turn === pending.entry.result.turn && !pending.foreign) {
          const content = event.data.message.content
          // Only the final non-tool Assistant message is eligible; reasoning and tool arguments never leave the host.
          if (!event.data.interrupted && !content.some(block => block.type === 'tool-call')) {
            const text = content.filter(block => block.type === 'text').map(block => block.text).join('')
            if (Buffer.byteLength(JSON.stringify({ requestId: pending.entry.result.requestId, status: 'completed', turn: event.data.turn, text })) > config.maxOutputBytes) this.settle(pending, 'failed', 'output_limit')
            else pending.text = text
          } else pending.text = undefined
        }
        if (event.type === 'turn/end' && event.data.turn === pending.entry.result.turn) {
          if (pending.foreign) this.settle(pending, 'unknown', 'foreign_input')
          else if (event.data.reason.kind !== 'completed') this.settle(pending, 'failed', 'turn_' + event.data.reason.kind)
          else if (pending.text === undefined) this.settle(pending, 'failed', 'no_final_text')
          else this.settle(pending, 'completed')
        }
      }
    })
  }

  async [Service.init](): Promise<void> {
    this.ledger = new Ledger(this.config.ledgerDir, this.config.maxLedgerEntries, this.config.maxOutputBytes)
    try {
      this.ctx.on('agent/created', ({ agent }) => { this.reconcile(agent) })
      for (const agent of this.ctx.agents.roots()) this.reconcile(agent)
      this.server.requestTimeout = this.config.requestTimeoutMs
      this.server.headersTimeout = this.config.requestTimeoutMs
      this.server.keepAliveTimeout = 1
      this.server.maxConnections = this.config.maxConcurrentRequests
      this.server.on('clientError', (_error, socket) => { socket.destroy() })
      await new Promise<void>((resolve, reject) => {
        this.server.once('error', reject)
        this.server.listen(this.config.port, '127.0.0.1', () => { this.server.removeListener('error', reject); resolve() })
      })
      const address = this.server.address()
      if (address === null || typeof address === 'string') throw new Error('peer-inbox: missing TCP listener')
      this.port = address.port
      this.server.on('error', () => { this.broken = true })
      this.ctx.effect(() => () => this.stop(), 'peerInbox.listener')
    } catch (error) { this.ledger.close(); throw error }
  }

  private async stop(): Promise<void> {
    this.closing = true
    for (const pending of [...this.pending.values()]) this.withdraw(pending, 'plugin_disposed')
    this.server.closeAllConnections()
    if (this.server.listening) await new Promise<void>((resolve, reject) => {
      this.server.close((error) => { if (error) reject(error); else resolve() })
    })
    this.ledger.close()
  }

  private reconcile(agent: Agent): void {
    for (const entry of this.ledger.all()) {
      if (entry.sessionId !== agent.id || entry.result.status === 'queued' || entry.result.status === 'running') continue
      const message = [...agent.inbox.nextTurn, ...agent.inbox.nextStep].find(item => item.id === entry.messageId && item.source.kind === 'peer-inbox')
      if (message !== undefined) agent.inbox.remove(message.id)
    }
  }
  private save(entry: Entry): void {
    try { this.ledger.put(entry) } catch (_error) { this.broken = true }
  }
  private settle(pending: Pending, status: 'completed' | 'failed' | 'unknown', failureCode?: string): void {
    const requestId = pending.entry.result.requestId
    if (!this.pending.delete(requestId)) return
    clearTimeout(pending.timer)
    pending.entry.result = { requestId, status, ...(pending.entry.result.turn === undefined ? {} : { turn: pending.entry.result.turn }), ...(status === 'completed' ? { text: pending.text ?? '' } : { failureCode: failureCode ?? 'unknown_failure' }) }
    this.save(pending.entry)
  }
  private withdraw(pending: Pending, reason: string): void {
    // Remove only our own still-pending item; never interrupt owner work.
    const queued = pending.entry.result.turn === undefined
    if (queued) {
      // Removing emits discarded synchronously; suppress that generic settlement.
      this.pending.delete(pending.entry.result.requestId)
      let removed = false
      try { removed = pending.agent.inbox.remove(pending.messageId) } catch (_error) { /* A disposed Agent cannot guarantee withdrawal. */ }
      this.pending.set(pending.entry.result.requestId, pending)
      this.settle(pending, removed ? 'failed' : 'unknown', removed ? reason + '_withdrawn' : reason + '_execution_unknown')
    } else this.settle(pending, 'unknown', reason + '_execution_unknown')
  }
  private reply(res: ServerResponse, code: number, data: unknown): void {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', connection: 'close' })
    res.end(JSON.stringify(data))
  }
  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.activeHttp++
    const timer = setTimeout(() => { if (!res.writableEnded) { this.reply(res, 408, { error: 'request_timeout' }); req.destroy() } }, this.config.requestTimeoutMs)
    try {
      if (this.closing || this.broken) throw new HttpError(503, 'unavailable')
      if (this.activeHttp > this.config.maxConcurrentRequests) throw new HttpError(429, 'concurrency_limit')
      if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== `127.0.0.1:${this.port}` || req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined) throw new HttpError(403, 'forbidden_origin')
      const headers = req.rawHeaders.filter((_, index) => index % 2 === 0).map(value => value.toLowerCase())
      if (['authorization', 'host', 'content-type', 'content-length'].some(key => headers.filter(value => value === key).length > 1)) throw new HttpError(400, 'duplicate_header')
      const authorization = req.headers.authorization
      const candidate = Buffer.from(authorization?.startsWith('Bearer ') ? authorization.slice(7) : '')
      if (candidate.length !== this.secret.length || !timingSafeEqual(candidate, this.secret)) throw new HttpError(401, 'unauthorized')
      if (req.method === 'GET' && req.url === '/v1/health') { this.reply(res, 200, { protocolVersion: 1, runtimeId: this.runtimeId }); return }
      if (req.method === 'GET' && req.url?.startsWith('/v1/requests/')) {
        const id = req.url.slice('/v1/requests/'.length)
        if (!idPattern.test(id)) throw new HttpError(400, 'invalid_request_id')
        const entry = this.ledger.get(id)
        if (entry === undefined) throw new HttpError(404, 'not_found')
        if (!this.config.allowedSessionIds.includes(entry.sessionId)) throw new HttpError(403, 'session_forbidden')
        this.reply(res, 200, entry.result); return
      }
      if (req.method !== 'POST' || req.url !== '/v1/requests') throw new HttpError(404, 'not_found')
      if (req.headers['content-type'] !== 'application/json' || req.headers['content-encoding'] !== undefined) throw new HttpError(400, 'invalid_content_type')
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of req) {
        const buffer = chunk as Buffer
        bytes += buffer.length
        if (bytes > this.config.maxRequestBytes) throw new HttpError(413, 'request_too_large')
        chunks.push(buffer)
      }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- unload can run while awaiting the request body.
      if (res.writableEnded || this.closing) return
      let body: unknown
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) } catch (_error) { throw new HttpError(400, 'invalid_json') }
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_request')
      const fields = body as Record<string, unknown>
      if (Object.keys(fields).length !== 4 || !['requestId', 'runtimeId', 'sessionId', 'text'].every(key => typeof fields[key] === 'string')) throw new HttpError(400, 'invalid_request')
      const { requestId, runtimeId, sessionId, text } = fields as Record<'requestId' | 'runtimeId' | 'sessionId' | 'text', string>
      if (!idPattern.test(requestId) || !idPattern.test(sessionId) || !text.trim() || !idPattern.test(runtimeId)) throw new HttpError(400, 'invalid_request')
      if (!this.config.allowedSessionIds.includes(sessionId)) throw new HttpError(403, 'session_forbidden')
      const fingerprint = createHash('sha256').update(JSON.stringify([runtimeId, sessionId, text])).digest('hex')
      const existing = this.ledger.get(requestId)
      if (existing !== undefined) {
        if (existing.fingerprint !== fingerprint) throw new HttpError(409, 'request_conflict')
        this.reply(res, 200, existing.result); return
      }
      if (runtimeId !== this.runtimeId) throw new HttpError(409, 'runtime_mismatch')
      if (this.pending.size >= this.config.maxPendingRequests) throw new HttpError(429, 'pending_limit')
      if (this.ledger.size >= this.config.maxLedgerEntries) throw new HttpError(503, 'ledger_full')
      const agent = this.ctx.agents.get(SessionId(sessionId))
      if (agent === undefined || !this.ctx.agents.roots().includes(agent)) throw new HttpError(409, 'session_not_live_root')
      const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'peer-inbox' } })
      const entry: Entry = { fingerprint, sessionId, messageId: message.id, result: { requestId, status: 'queued' } }
      // A durable tombstone is committed before the first possible execution.
      this.ledger.put(entry)
      const pending: Pending = { entry, agent, messageId: message.id, foreign: false, timer: setTimeout(() => { this.withdraw(pending, 'timeout') }, this.config.executionTimeoutMs) }
      this.pending.set(requestId, pending)
      try { agent.followup(message) } catch (_error) { this.withdraw(pending, 'admission_failed') }
      // oxlint-disable-next-line typescript/no-unnecessary-condition -- followup synchronously emits listeners that can fail persistence.
      if (this.broken) throw new HttpError(503, 'unavailable')
      this.reply(res, 202, entry.result)
    } catch (error) {
      if (!(error instanceof HttpError)) this.broken = true
      if (!res.writableEnded && !res.destroyed) this.reply(res, error instanceof HttpError ? error.status : 503, { error: error instanceof HttpError ? error.code : 'unavailable' })
    } finally { clearTimeout(timer); this.activeHttp-- }
  }
}
export default PeerInbox
