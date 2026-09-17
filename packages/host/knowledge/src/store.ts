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

  /** @returns upstream artifacts, read from ARTIFACT.md rather than the generated index. */
  async list(): Promise<readonly KnowledgeRecord[]> {
    const records = record.array().parse(await this.command({ command: 'list' }))
    this.paths.clear()
    for (const item of records) this.paths.set(item.id, item.path)
    return records
  }

  /** @param id - stable artifact identity. @returns Markdown and original captured evidence. */
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
          data[line.slice(0, colon)] = JSON.parse(line.slice(colon + 1)) as unknown
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

  /** Original evidence is fetched only on explicit request, never with the ordinary reader. */
  async raw(id: KnowledgeId): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ command: 'raw', id }))[0] as KnowledgeDocument
  }

  async destinations(): Promise<string[]> { return z.string().array().parse(await this.command({ command: 'destinations' })) }

  /** Feed snapshots enter Intake without a model call or any main-Vault publication. */
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

  async learn(request: import('./types.ts').KnowledgeLearnRequest): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ ...request, command: 'learn' }))[0] as KnowledgeDocument
  }

  async direct(request: import('./types.ts').KnowledgeDirectRequest): Promise<KnowledgeDocument> {
    if (!(await this.destinations()).includes(request.suggestedDestination)) throw new Error('knowledge: invalid suggested destination')
    return document.array().length(1).parse(await this.command({ ...request, command: 'direct' }))[0] as KnowledgeDocument
  }

  /** @returns a durable processing attempt linked to intact original evidence. */
  async begin(id: KnowledgeId, runId: string, timeoutMs: number): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ command: 'begin', id, runId, timeoutMs }) as unknown[])[0])
  }

  /** @returns the settled attempt; failed and successful outputs remain separate from the source. */
  async settle(id: KnowledgeId, runId: string, result: { cards: ProcessedCard[] } | { error: string }): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ id, runId, ...'cards' in result
      ? { command: 'finish', cards: result.cards }
      : { command: 'fail', error: result.error } }) as unknown[])[0])
  }

  /** @returns owner-reviewed Agent knowledge; never publishes to the main Vault. */
  async review(request: KnowledgeReviewRequest): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ ...request, command: 'review' }) as unknown[])[0])
  }

  /**
   * @param request - accepted artifact and new destination.
   * @returns content-bound approval preview without writing outside Agents.
   */
  async preview(request: KnowledgePreviewRequest): Promise<KnowledgePromotionPreview> {
    return z.object({ id: record.shape.id, destination: z.string(), before: z.string(), after: z.string(), token: z.string() })
      .array().length(1).parse(await this.command({ ...request, command: 'preview' }))[0] as KnowledgePromotionPreview
  }

  /**
   * @param request - explicit approval of the exact preview.
   * @returns artifact with publication receipts; never overwrites a destination.
   */
  async promote(request: KnowledgePromoteRequest): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ ...request, command: 'promote' }))[0] as KnowledgeDocument
  }

  /** @param request - revision-bound source disposition. @returns updated metadata with original evidence unchanged. */
  async shelve(request: KnowledgeShelveRequest): Promise<KnowledgeDocument> {
    return document.array().length(1).parse(await this.command({ ...request, command: 'shelve' }))[0] as KnowledgeDocument
  }

  /**
   * @param sessionId - stable capture identity; a Session id, or a hashed source URL for other kinds.
   * @param title - display title, sanitized by the package writer.
   * @param content - complete source evidence; passed to a model only through an explicit distillation.
   * @param source - external-source provenance; omitted means a captured conversation.
   * @returns the saved Intake artifact, reusing an identical source snapshot.
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
          try { resolvePromise(JSON.parse(stdout) as unknown) } catch (parseError) { reject(new Error('knowledge: invalid bridge response', { cause: parseError })) }
        })
      child.stdin?.on('error', reject)
      child.stdin?.end(JSON.stringify(request), 'utf8')
    })
  }
}
