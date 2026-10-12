import { execFile } from 'node:child_process'
import { join, resolve, relative, sep } from 'node:path'
import { lstat, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { processingInput, type ProcessedCard } from './processing.ts'
import { cleanExternalText, extractHtmlText } from '@deepseek-ai/dsh-web-fetch-http'
import type { KnowledgeDocument, KnowledgeId, KnowledgeNewsSource, KnowledgeRecord, KnowledgeReviewRequest, KnowledgePreviewRequest, KnowledgePromotionPreview, KnowledgePromoteRequest, KnowledgeShelveRequest } from './types.ts'

const record = z.object({
  reviewed: z.boolean().default(false), learned: z.boolean().default(false), source: z.string().default('external'),
  suggestedDestination: z.string().default(''), publishedTo: z.string().default(''),
  id: z.string().regex(/^agent-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u)
    .transform(value => value as KnowledgeId),
  title: z.string(), layer: z.enum(['1 Intake', '2 AI Processing', '3 Knowledge']),
  status: z.string(), updatedAt: z.string(), topics: z.array(z.string()),
  derivedFrom: z.array(z.object({ id: z.string(), link: z.string() })), path: z.string(),
  workflow: z.enum(['pending', 'processing', 'processed', 'shelved', 'failed', 'awaiting-review', 'accepted', 'rejected']), revision: z.string(),
})
const document = record.extend({ markdown: z.string(), evidence: z.string(), content: z.string() })

/** Delegates authoritative reads and guarded writes to the Vault's Agent Layer tool. */
export class KnowledgeStore {
  private readonly paths = new Map<string, string>()
  constructor(private readonly agentRoot: string) {}

  /**
   * List authoritative Agent Layer artifact metadata.
   * @returns Validated artifacts without captured evidence.
   */
  async list(): Promise<readonly KnowledgeRecord[]> {
    const records = record.array().parse(await this.command({ command: 'list' }))
    this.paths.clear()
    for (const item of records) this.paths.set(item.id, item.path)
    return records
  }

  /**
   * Read ordinary artifact content; raw evidence requires a separate request.
   * @param id - Stable artifact identity.
   * @returns Current artifact content and revision.
   */
  async read(id: KnowledgeId): Promise<KnowledgeDocument> {
    const path = this.paths.get(id)
    if (path !== undefined) {
      try {
        const root = resolve(this.agentRoot)
        const target = resolve(root, path)
        const parts = relative(root, target).split(sep)
        if (parts.some(part => part === '..' || part === '') || (parts.at(-1) !== 'ARTIFACT.md' && !(parts.length === 2 && parts[0] === '1 Intake' && parts[1]?.endsWith('.md')))) throw new Error('knowledge: invalid cached path')
        let cursor = root
        for (const part of parts) {
          cursor = join(cursor, part)
          if ((await lstat(cursor)).isSymbolicLink()) throw new Error('knowledge: linked artifact paths are not allowed')
        }
        const markdown = await readFile(target, 'utf8')
        const header = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/u.exec(markdown)
        if (header === null || header[1] === undefined) throw new Error('knowledge: invalid card header')
        const data: Record<string, unknown> = {}
        for (const line of header[1].split(/\r?\n/u)) {
          const colon = line.indexOf(':')
          if (colon < 1) throw new Error('knowledge: invalid card field')
          const value: unknown = JSON.parse(line.slice(colon + 1))
          data[line.slice(0, colon)] = value
        }
        if (data['schema_version'] === 2 && data['id'] === id && data['layer'] === parts[0]) {
          let workflow = data['workflow'] ?? (parts[0] === '1 Intake' ? 'pending' : parts[0] === '3 Knowledge' ? 'accepted' : 'awaiting-review')
          if (workflow === 'processing' && typeof data['expires_at'] === 'string' && Date.parse(data['expires_at']) < Date.now()) workflow = 'failed'
          return document.parse({ id, path, layer: data['layer'], title: data['title'], topics: data['topics'], updatedAt: data['updated'],
            derivedFrom: data['derived_from'], workflow, status: workflow, reviewed: data['reviewed'], learned: data['learned'],
            source: data['source'], suggestedDestination: data['suggested_destination'], publishedTo: data['published_to'],
            revision: createHash('sha256').update(markdown, 'utf8').digest('hex'),
            content: markdown.slice(header[0].length).trim(), markdown: '', evidence: '' })
        }
      } catch {
        // A move or legacy representation invalidates only the path hint; the guarded bridge resolves identity again.
        this.paths.delete(id)
      }
    }
    const result = document.array().length(1).parse(await this.command({ command: 'read', id }))[0] as KnowledgeDocument
    this.paths.set(id, result.path)
    return result
  }

  /**
   * Read original captured evidence only on explicit request.
   * @param id - Stable artifact identity.
   * @returns Artifact with its original evidence.
   */
  async raw(id: KnowledgeId): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ command: 'raw', id }))[0] as KnowledgeDocument
  }

  /**
   * Read the Vault bridge allowlist for suggested publication destinations.
   * @returns Existing destination folders.
   */
  async destinations(): Promise<string[]> { return z.string().array().parse(await this.command({ command: 'destinations' })) }

  /**
   * Capture a batch of feed evidence in Intake without model calls or main-Vault publication.
   * @param items - Source snapshots with canonical URLs and publisher metadata.
   */
  async saveFeed(items: readonly import('./types.ts').KnowledgeSaveTextRequest[]): Promise<void> {
    const captures = items.map((item) => {
      const url = new URL(item.sourceUrl)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('knowledge: invalid feed URL')
      const content = extractHtmlText(item.content)
      return { command: 'save', sessionId: `news-${createHash('sha256').update(url.href).digest('hex')}`,
        title: cleanExternalText(item.title), content, body: content, kind: 'news', canonicalUrl: url.href,
        publisher: item.publisher, retrievedAt: item.retrievedAt }
    })
    await this.command({ command: 'saveBatch', items: captures })
  }

  /**
   * Set revision-bound learning state without publishing to the main Vault.
   * @param request - Artifact revision and owner learning state.
   * @returns Updated Agent Layer artifact.
   */
  async learn(request: import('./types.ts').KnowledgeLearnRequest): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ ...request, command: 'learn' }))[0] as KnowledgeDocument
  }

  /**
   * Create a directly requested concept card in Agent Knowledge without main-Vault publication.
   * @param request - Concept content, tags, and suggested existing destination.
   * @returns Unreviewed and unlearned concept artifact.
   */
  async direct(request: import('./types.ts').KnowledgeDirectRequest): Promise<KnowledgeDocument> {
    if (!(await this.destinations()).includes(request.suggestedDestination)) throw new Error('knowledge: invalid suggested destination')
    return document.array().length(1).parse(await this.command({ ...request, command: 'direct' }))[0] as KnowledgeDocument
  }

  /**
   * Create a durable processing attempt linked to intact original evidence.
   * @param id - Source artifact identity.
   * @param runId - Unique processing attempt identity.
   * @param timeoutMs - Attempt lifetime used to detect interrupted work.
   * @returns Durable processing attempt.
   */
  async begin(id: KnowledgeId, runId: string, timeoutMs: number): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ command: 'begin', id, runId, timeoutMs }) as unknown[])[0])
  }

  /**
   * Persist one terminal processing receipt separate from original evidence.
   * @param id - Processing attempt artifact identity.
   * @param runId - Attempt identity that owns settlement.
   * @param result - Validated derived cards or the failed attempt error.
   * @returns Settled processing artifact.
   */
  async settle(id: KnowledgeId, runId: string, result: { cards: ProcessedCard[] } | { error: string }): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ id, runId, ...'cards' in result
      ? { command: 'finish', cards: result.cards }
      : { command: 'fail', error: result.error } }) as unknown[])[0])
  }

  /**
   * Record a revision-bound owner review within Agent Layer.
   * @param request - Artifact revision, decision, and optional review details.
   * @returns Reviewed artifact; stale revisions fail.
   */
  async review(request: KnowledgeReviewRequest): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ ...request, command: 'review' }) as unknown[])[0])
  }

  /**
   * Prepare exact destination content for owner approval without publishing it.
   * @param request - Accepted artifact and intended destination.
   * @returns Before and after content bound to an approval token.
   */
  async preview(request: KnowledgePreviewRequest): Promise<KnowledgePromotionPreview> {
    return z.object({ id: record.shape.id, destination: z.string(), before: z.string(), after: z.string(), token: z.string() })
      .array().length(1).parse(await this.command({ ...request, command: 'preview' }))[0] as KnowledgePromotionPreview
  }

  /**
   * Publish only the exact owner-approved preview through the guarded Vault bridge.
   * @param request - Artifact, destination, and explicit approval token.
   * @returns Published artifact with receipts; stale previews and existing destinations fail.
   */
  async promote(request: KnowledgePromoteRequest): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ ...request, command: 'promote' }))[0] as KnowledgeDocument
  }

  /**
   * Change an artifact disposition without modifying captured evidence.
   * @param request - Artifact revision and desired shelving state.
   * @returns Updated artifact metadata and content.
   */
  async shelve(request: KnowledgeShelveRequest): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ ...request, command: 'shelve' }))[0] as KnowledgeDocument
  }

  /**
   * Save source evidence in Intake, reusing an identical capture snapshot.
   * @param sessionId - Stable Session identity or source URL hash.
   * @param title - Display title sanitized by the writer.
   * @param content - Complete original source evidence.
   * @param source - Optional external-source attribution.
   * @param cleanedBody - Optional sanitized reader content; original evidence remains separate.
   * @returns Saved Intake artifact metadata.
   */
  async save(
    sessionId: string, title: string, content: string, source?: KnowledgeNewsSource, cleanedBody?: string,
  ): Promise<KnowledgeRecord> {
    const body = cleanedBody ?? (source ? content : processingInput(content))
    const result = await this.command({ command: 'save', sessionId, title, content, body, ...source ?? {} })
    return record.array().length(1).parse(result)[0] as KnowledgeRecord
  }

  private async command(request: object): Promise<unknown> {
    return await new Promise((resolvePromise, reject) => {
      const child = execFile(process.platform === 'win32' ? 'powershell.exe' : 'pwsh',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(resolve(this.agentRoot), 'Tools', 'DshKnowledge.ps1'), '-Stdin'],
        { windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error !== null) { reject(new Error(`knowledge: ${stderr.trim() || error.message}`)); return }
          try { const value: unknown = JSON.parse(stdout); resolvePromise(value) } catch (parseError) { reject(new Error('knowledge: invalid bridge response', { cause: parseError })) }
        })
      child.stdin?.on('error', reject)
      child.stdin?.end(JSON.stringify(request), 'utf8')
    })
  }
}
