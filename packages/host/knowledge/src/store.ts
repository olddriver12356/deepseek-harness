import { execFile } from 'node:child_process'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import type { KnowledgeDocument, KnowledgeId, KnowledgeNewsSource, KnowledgeRecord, KnowledgeReviewRequest, KnowledgePreviewRequest, KnowledgePromotionPreview, KnowledgePromoteRequest, KnowledgeShelveRequest } from './types.ts'

const record = z.object({
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
  constructor(private readonly agentRoot: string) {}

  /** @returns upstream artifacts, read from ARTIFACT.md rather than the generated index. */
  async list(): Promise<readonly KnowledgeRecord[]> {
    return record.array().parse(await this.command({ command: 'list' }))
  }

  /** @param id - stable artifact identity. @returns Markdown and original captured evidence. */
  async read(id: KnowledgeId): Promise<KnowledgeDocument> {
    return document.array().length(1)
      .parse(await this.command({ command: 'read', id }))[0] as KnowledgeDocument
  }

  /** @returns a durable processing attempt linked to intact original evidence. */
  async begin(id: KnowledgeId, runId: string, timeoutMs: number): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ command: 'begin', id, runId, timeoutMs }) as unknown[])[0])
  }

  /** @returns the settled attempt; failed and successful outputs remain separate from the source. */
  async settle(id: KnowledgeId, runId: string, result: { content: string } | { error: string }): Promise<KnowledgeDocument> {
    return document.parse((await this.command({ id, runId, ...'content' in result
      ? { command: 'finish', knowledgeType: 'reference', content: result.content }
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
  async save(sessionId: string, title: string, content: string, source?: KnowledgeNewsSource): Promise<KnowledgeRecord> {
    return record.array().length(1).parse(await this.command({ command: 'save', sessionId, title, content, ...source ?? {} }))[0] as KnowledgeRecord
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
