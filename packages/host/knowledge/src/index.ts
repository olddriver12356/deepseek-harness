import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { flushLiveSessionLog, readSessionLogText } from '@deepseek-ai/dsh-session-log-export'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-tools'
import { createUserMessage, BlockAssembler } from '@deepseek-ai/dsh-llm'
import { cleanExternalText, extractHtmlText } from '@deepseek-ai/dsh-web-fetch-http'
import { parseCards, PROCESSING_SYSTEM } from './processing.ts'
import { KnowledgeStore } from './store.ts'
import type { KnowledgeDocument, KnowledgeReadRequest, KnowledgeRecord, KnowledgeSaveRequest, KnowledgeSaveTextRequest, KnowledgeReviewRequest, KnowledgePreviewRequest, KnowledgePromotionPreview, KnowledgePromoteRequest, KnowledgeShelveRequest } from './types.ts'

export type * from './types.ts'
export { KnowledgeStore } from './store.ts'
/**
 * Vault bridge location and bounded distillation resource limits.
 */
export interface Config {
  /** Vault containing the canonical Agents/Tools/DshKnowledge.ps1 bridge. */
  readonly vaultRoot: string
  /** Whole distillation attempt deadline; also bounds interrupted-run retry eligibility. */
  readonly distillTimeoutMs: number
  /** Reject larger framed prompts without silently truncating evidence. */
  readonly maxInputBytes: number
}
export const Config: z<Config> = z.object({
  vaultRoot: z.string().required(),
  distillTimeoutMs: z.number().step(1).min(1).max(2147483647).required(),
  maxInputBytes: z.number().step(1).min(1).required(),
})

/** Human-facing capture and upstream artifact reader; no model-facing write tool. */
export class KnowledgeService extends TypertRemoteService {
  static Config = Config
  static inject = ['sessions', 'sessionPersistence']
  private readonly store: KnowledgeStore
  private readonly shutdown = new AbortController()
  private readonly runs = new Set<Promise<KnowledgeDocument>>()

  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'knowledge')
    this.store = new KnowledgeStore(join(config.vaultRoot, 'Agents'))
    ctx.effect(() => async () => {
      this.shutdown.abort()
      await Promise.allSettled(this.runs)
    }, 'knowledge: distillation shutdown')
  }

  /**
   * List authoritative Agent Layer artifact metadata.
   * @returns Validated artifacts without captured evidence.
   */
  @Remote('list')
  list(): Promise<readonly KnowledgeRecord[]> { return this.store.list() }

  /**
   * Read ordinary artifact content; raw evidence requires a separate request.
   * @param request - Stable artifact identity.
   * @returns Current artifact content and revision.
   */
  @Remote('read')
  read(request: KnowledgeReadRequest): Promise<KnowledgeDocument> { return this.store.read(request.id) }

  /**
   * Read original captured evidence only on explicit request.
   * @param request - Stable artifact identity.
   * @returns Artifact with its original evidence.
   */
  @Remote('raw')
  raw(request: KnowledgeReadRequest): Promise<KnowledgeDocument> { return this.store.raw(request.id) }

  /**
   * Set revision-bound learning state without publishing to the main Vault.
   * @param request - Artifact revision and owner learning state.
   * @returns Updated Agent Layer artifact.
   */
  @Remote('learn')
  learn(request: import('./types.ts').KnowledgeLearnRequest): Promise<KnowledgeDocument> { return this.store.learn(request) }

  /**
   * Create a directly requested concept card in Agent Knowledge without main-Vault publication.
   * @param request - Concept content, tags, and suggested existing destination.
   * @returns Unreviewed and unlearned concept artifact.
   */
  @Remote('direct')
  direct(request: import('./types.ts').KnowledgeDirectRequest): Promise<KnowledgeDocument> {
    return this.store.direct({ ...request, content: cleanExternalText(request.content) })
  }

  /**
   * Capture a flushed Session log in Intake without model processing or publication.
   * @param request - Session identity and capture title.
   * @returns Saved source artifact metadata.
   */
  @Remote('save')
  async save(request: KnowledgeSaveRequest): Promise<KnowledgeRecord> {
    await flushLiveSessionLog({ sessions: this.ctx.sessions }, request.sessionId)
    const content = await readSessionLogText(this.ctx.sessionPersistence, request.sessionId)
    if (content === undefined) throw new Error('knowledge: Session not found')
    return this.store.save(request.sessionId, request.title, content)
  }

  /**
   * Capture attributed external text in Intake with original evidence retained.
   * @param request - Source text, canonical URL, publisher, and retrieval time.
   * @returns Saved source artifact metadata.
   */
  @Remote('saveText')
  async saveText(request: KnowledgeSaveTextRequest): Promise<KnowledgeRecord> {
    if (!request.sourceUrl || !request.content) throw new Error('knowledge: source URL and content are required')
    if (!request.publisher || !request.retrievedAt) throw new Error('knowledge: publisher and retrievedAt are required')
    const sourceUrl = new URL(request.sourceUrl)
    if (!['http:', 'https:'].includes(sourceUrl.protocol) || sourceUrl.username || sourceUrl.password) throw new Error('knowledge: invalid source URL')
    const identity = `news-${createHash('sha256').update(request.sourceUrl, 'utf8').digest('hex')}`
    const content = extractHtmlText(request.content)
    return this.store.save(identity, cleanExternalText(request.title), request.content, {
      kind: 'news', canonicalUrl: request.sourceUrl, publisher: request.publisher, retrievedAt: request.retrievedAt,
    }, content)
  }

  /**
   * Record a revision-bound owner review within Agent Layer.
   * @param request - Artifact revision, decision, and optional review details.
   * @returns Reviewed artifact; stale revisions fail.
   */
  @Remote('review')
  review(request: KnowledgeReviewRequest): Promise<KnowledgeDocument> { return this.store.review(request) }

  /**
   * Prepare exact destination content for owner approval without publishing it.
   * @param request - Accepted artifact and intended destination.
   * @returns Before and after content bound to an approval token.
   */
  @Remote('preview')
  preview(request: KnowledgePreviewRequest): Promise<KnowledgePromotionPreview> { return this.store.preview(request) }

  /**
   * Publish only the exact owner-approved preview through the guarded Vault bridge.
   * @param request - Artifact, destination, and explicit approval token.
   * @returns Published artifact with receipts; stale previews and existing destinations fail.
   */
  @Remote('promote')
  promote(request: KnowledgePromoteRequest): Promise<KnowledgeDocument> { return this.store.promote(request) }

  /**
   * Change an artifact disposition without modifying captured evidence.
   * @param request - Artifact revision and desired shelving state.
   * @returns Updated artifact metadata and content.
   */
  @Remote('shelve')
  shelve(request: KnowledgeShelveRequest): Promise<KnowledgeDocument> { return this.store.shelve(request) }

  /**
   * Run one bounded, tool-free distillation with durable attempt and settlement receipts.
   * @param request - Source artifact selected for processing.
   * @returns Settled attempt; failures remain recorded and retryable after restart.
   */
  @Remote('distill')
  async distill(request: KnowledgeReadRequest): Promise<KnowledgeDocument> {
    this.shutdown.signal.throwIfAborted()
    const run = this.runDistillation(request)
    this.runs.add(run)
    try { return await run } finally { this.runs.delete(run) }
  }

  private async runDistillation(request: KnowledgeReadRequest): Promise<KnowledgeDocument> {
    const defaults = this.ctx.get('agentDefaultModel')
    const llm = this.ctx.get('llm')
    if (llm === undefined || defaults === undefined) {
      throw new Error('knowledge: processing requires llm and agentDefaultModel')
    }
    const runId = SessionId(`knowledge-${randomUUID()}`)
    const attempt = await this.store.begin(request.id, runId, this.config.distillTimeoutMs)
    const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(this.config.distillTimeoutMs)])
    let cards: ReturnType<typeof parseCards> = []
    try {
      const source = attempt.derivedFrom[0]
      if (source === undefined) throw new Error('knowledge: distillation source is missing')
      const original = await this.store.read(source.id as KnowledgeDocument['id'])
      const destinations = await this.store.destinations()
      const prompt = JSON.stringify({ allowedDestinations: destinations, untrustedSource: original.content, sourceId: original.id })
      if (Buffer.byteLength(prompt, 'utf8') > this.config.maxInputBytes) throw new Error('knowledge: source exceeds maxInputBytes; source was not truncated')
      signal.throwIfAborted()
      const selection = defaults.currentSelection()
      // One-shot generation intentionally bypasses Agent assembly, Memory, MCP, skills, and all tools.
      const assembler = new BlockAssembler()
      let outputBytes = 0
      for await (const chunk of llm.stream({ ...selection, sessionId: runId, system: PROCESSING_SYSTEM,
        messages: [createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'user' } })],
        tools: [], maxTokens: 16000, signal })) {
        signal.throwIfAborted()
        if (chunk.type === 'tool-call-delta' || chunk.type === 'block-start' && chunk.blockType === 'tool-call'
          || chunk.type === 'block-end' && chunk.block.type === 'tool-call') throw new Error('knowledge: processing cannot invoke tools')
        if (chunk.type === 'text-delta') outputBytes += Buffer.byteLength(chunk.text)
        if (outputBytes > 500_000) throw new Error('knowledge: model output exceeds limit')
        assembler.push(chunk)
      }
      signal.throwIfAborted()
      if (assembler.finish.kind !== 'stop') throw new Error('knowledge: processing did not complete successfully')
      cards = parseCards(assembler.blocks().filter(block => block.type === 'text').map(block => block.text).join(''), destinations)
    } catch (error) {
      try { await this.store.settle(attempt.id, runId, { error: String(error) }) }
      catch (persistenceError) { throw new AggregateError([error, persistenceError], `${String(error)}; failure receipt: ${String(persistenceError)}`) }
      throw error
    }
    // A failed publication must not trigger a second terminal write after an ambiguous commit.
    return await this.store.settle(attempt.id, runId, { cards })
  }
}

export default KnowledgeService
