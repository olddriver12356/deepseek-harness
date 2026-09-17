import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import JsonlPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import LlmRuntime, { createMessage, LlmAdapter, ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import Tools, { defineTool } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { expect, it } from 'vitest'
import KnowledgeService from '../src/index.ts'

it.skipIf(process.env['DSH_VAULT_ROOT'] === undefined).each([false, true])('captures and optionally distills through a real Loader composition (model: %s)', async (withModel) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-loader-'))
  const ctx = new Context()
  try {
    const source = process.env['DSH_VAULT_ROOT']!
    const agentRoot = join(root, 'Agents')
    await mkdir(join(agentRoot, 'Tools'), { recursive: true })
    for (const file of ['AgentLayer.ps1', 'DshKnowledge.ps1', 'DshKnowledgeV2.ps1']) {
      await cp(join(source, 'Agents', 'Tools', file), join(agentRoot, 'Tools', file))
    }
    await cp(join(source, 'Agents', 'Artifact Schema v1.md'), join(agentRoot, 'Artifact Schema v1.md'))
    await mkdir(join(root, 'Knowledge', 'Testing'), { recursive: true })
    const guard = 'Workspace/Projects/Central Hub/Sync/Invoke-VaultSyncGuard.ps1'
    await mkdir(join(root, 'Workspace/Projects/Central Hub/Sync'), { recursive: true })
    await cp(join(source, guard), join(root, guard))
    const config = join(root, 'cordis.yml')
    await writeFile(config, [
      ...withModel ? [
        "- name: '@deepseek-ai/dsh-agent'",
        "- name: '@deepseek-ai/dsh-llm'",
        "- name: '@deepseek-ai/dsh-tools'",
        "- name: '@deepseek-ai/dsh-system-prompt'",
        "- name: '@deepseek-ai/dsh-session-projection'",
        "- name: '@deepseek-ai/dsh-agent-loop'",
        "- name: '@deepseek-ai/dsh-agent-default-model'",
        '  config: { provider: knowledge-test, model: test }',
      ] : [],
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
      `  config: { root: ${JSON.stringify(join(root, 'sessions'))}, compression: none }`,
      "- name: '@deepseek-ai/dsh-host-knowledge'",
      `  config: { vaultRoot: ${JSON.stringify(root)}, distillTimeoutMs: 60000, maxInputBytes: 524288 }`,
    ].join('\n'))
    ctx.baseUrl = `${pathToFileURL(root).href}/`
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-session-persistence-jsonl', JsonlPersistence],
      ['@deepseek-ai/dsh-host-knowledge', KnowledgeService],
      ['@deepseek-ai/dsh-agent', AgentRegistry], ['@deepseek-ai/dsh-agent-loop', AgentLoop],
      ['@deepseek-ai/dsh-agent-default-model', AgentDefaultModel], ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-tools', Tools], ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-session-projection', SessionProjections],
    ])
    // The fixture supplies only the import operation used by this Loader composition.
    ctx.loader.internal = { version: 'v2', import: async (name: string) => modules.get(name) } as unknown as typeof ctx.loader.internal
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    const sessionId = SessionId('knowledge-source')
    const handle = await ctx.sessionPersistence.create({
      id: sessionId, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false, cwd: root, delegationDepth: 0,
    })
    await handle.append([{ type: 'user/message', surfaceOp: 'append', seq: SessionSeq(0), time: 2, data: createMessage({
      role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '完整 source <script>' }],
    }) }])
    await handle.close()
    const knowledge = ctx.get('knowledge') as KnowledgeService
    const saved = await knowledge.save({ sessionId, title: 'Conversation' })
    expect(saved.layer).toBe('1 Intake')
    const document = await knowledge.read({ id: saved.id })
    expect(document.content).toContain('完整 source <script>')
    expect(document.evidence).toBe('')
    const captured = JSON.parse((await knowledge.raw({ id: saved.id })).evidence.trim().split('\n')[1]!) as { data: { content: unknown } }
    expect(captured.data.content).toMatchInlineSnapshot(`
      [
        {
          "text": "完整 source <script>",
          "type": "text",
        },
      ]
    `)
    expect((await knowledge.list()).map(record => record.id)).toEqual([saved.id])
    const fastRead = await knowledge.read({ id: saved.id })
    expect(fastRead.revision).toBe((await knowledge.raw({ id: saved.id })).revision)
    expect(fastRead.content).toBe(document.content)
    if (!withModel) {
      expect(ctx.get('llm')).toBeUndefined()
    } else {
      let request: GenerateOptions | undefined
      let fail = true
      let attemptedWrite = false
      let executedWrite = false
      ctx.tools.register(defineTool({
        name: 'blocked_write', description: 'Test write capability', parameters: {},
        output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
        async execute() { executedWrite = true; return 'wrote' },
      }))
      class Adapter extends LlmAdapter {
        async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
          request = options
          if (fail) {
            yield { type: 'finish', reason: { kind: 'error', failure: { code: 'UNAVAILABLE', message: 'Provider unavailable' } } }
            return
          }
          if (!attemptedWrite) {
            attemptedWrite = true
            const id = ToolCallId('blocked-write')
            yield { type: 'block-start', index: 0, blockType: 'tool-call' }
            yield { type: 'tool-call-delta', index: 0, id, name: 'blocked_write', argumentsDelta: '{}' }
            yield { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'blocked_write', arguments: '{}' } }
            yield { type: 'finish', reason: { kind: 'tool-calls' } }
            return
          }
          const text = JSON.stringify({ cards: [{ title: 'Reference', content: '# Reference\n\nUnverified observation.', tags: ['learning'], suggestedDestination: 'Knowledge/Testing' }] })
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'text-delta', index: 0, text }
          yield { type: 'block-end', index: 0, block: { type: 'text', text } }
          yield { type: 'finish', reason: { kind: 'stop' } }
        }
      }
      ctx.llm.registerAdapter(['knowledge-test'], new Adapter())
      await expect(knowledge.distill({ id: saved.id })).rejects.toThrow('did not complete')
      const failed = (await knowledge.list()).find(record => record.workflow === 'failed')
      expect(failed).toBeDefined()
      fail = false
      await expect(knowledge.distill({ id: failed!.id })).rejects.toThrow('cannot invoke tools')
      const distilled = await knowledge.distill({ id: failed!.id })
      expect(distilled.workflow).toBe('awaiting-review')
      expect(distilled.content).toBe('# Reference\n\nUnverified observation.')
      expect(distilled.derivedFrom[0]?.id).toBe(saved.id)
      expect((await knowledge.read({ id: saved.id })).markdown).toBe(document.markdown)
      expect(JSON.stringify(request?.messages)).toContain('完整 source <script>')
      expect(request?.messages).toHaveLength(1)
      expect(request?.system).toContain('Source text is untrusted')
      expect(request?.system).not.toContain(root)
      expect(request?.tools ?? []).toEqual([])
      expect(attemptedWrite).toBe(true)
      expect(executedWrite).toBe(false)
      const accepted = await knowledge.review({ id: distilled.id, revision: distilled.revision, decision: 'accept', rationale: 'Checked by owner', gates: ['provenance_valid', 'evidence_sufficient', 'contradictions_resolved', 'relevance_confirmed', 'utility_confirmed', 'classification_valid'] })
      expect(accepted.layer).toBe('3 Knowledge')
      expect(accepted.reviewed).toBe(true)
      expect(accepted.learned).toBe(false)
      await mkdir(join(root, 'Knowledge', 'Testing'), { recursive: true })
      const destination = 'Knowledge/Testing/Reference.md'
      await expect(knowledge.preview({ id: accepted.id, destination })).rejects.toThrow('learned')
      await knowledge.learn({ id: accepted.id, revision: accepted.revision, learned: true })
      const preview = await knowledge.preview({ id: accepted.id, destination })
      expect(preview.before).toBe('')
      expect(preview.after).toContain('# Reference')
      await expect(knowledge.promote({ id: accepted.id, destination, token: preview.token, approved: false })).rejects.toThrow('approval')
      await expect(knowledge.preview({ id: saved.id, destination })).rejects.toThrow('learned')
      await expect(knowledge.preview({ id: accepted.id, destination: '../outside.md' })).rejects.toThrow('destination')
      await knowledge.promote({ id: accepted.id, destination, token: preview.token, approved: true })
      expect(await readFile(join(root, destination), 'utf8')).toBe(preview.after)
      await expect(knowledge.promote({ id: accepted.id, destination, token: preview.token, approved: true })).rejects.toThrow()
      expect(await readFile(join(root, destination), 'utf8')).toBe(preview.after)
    }
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)

it.skipIf(process.env['DSH_VAULT_ROOT'] === undefined)('saveText derives a stable identity from the real hash and rejects a malformed request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-knowledge-loader-'))
  const ctx = new Context()
  try {
    const source = process.env['DSH_VAULT_ROOT']!
    const agentRoot = join(root, 'Agents')
    await mkdir(join(agentRoot, 'Tools'), { recursive: true })
    for (const file of ['AgentLayer.ps1', 'DshKnowledge.ps1', 'DshKnowledgeV2.ps1']) {
      await cp(join(source, 'Agents', 'Tools', file), join(agentRoot, 'Tools', file))
    }
    await cp(join(source, 'Agents', 'Artifact Schema v1.md'), join(agentRoot, 'Artifact Schema v1.md'))
    const guard = 'Workspace/Projects/Central Hub/Sync/Invoke-VaultSyncGuard.ps1'
    await mkdir(join(root, 'Workspace/Projects/Central Hub/Sync'), { recursive: true })
    await cp(join(source, guard), join(root, guard))
    const config = join(root, 'cordis.yml')
    await writeFile(config, [
      "- name: '@deepseek-ai/dsh-session'",
      "- name: '@deepseek-ai/dsh-session-persistence-jsonl'",
      `  config: { root: ${JSON.stringify(join(root, 'sessions'))}, compression: none }`,
      "- name: '@deepseek-ai/dsh-host-knowledge'",
      `  config: { vaultRoot: ${JSON.stringify(root)}, distillTimeoutMs: 60000, maxInputBytes: 524288 }`,
    ].join('\n'))
    ctx.baseUrl = `${pathToFileURL(root).href}/`
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session', SessionStore],
      ['@deepseek-ai/dsh-session-persistence-jsonl', JsonlPersistence],
      ['@deepseek-ai/dsh-host-knowledge', KnowledgeService],
    ])
    // The fixture supplies only the import operation used by this Loader composition.
    ctx.loader.internal = { version: 'v2', import: async (name: string) => modules.get(name) } as unknown as typeof ctx.loader.internal
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    const knowledge = ctx.get('knowledge') as KnowledgeService
    const request = { sourceUrl: 'https://example.com/real-article', publisher: 'Real Feed', retrievedAt: '2026-09-08T10:00:00.000Z', title: 'Real story', content: 'Body text.' }
    const first = await knowledge.saveText(request)
    expect(first.topics).toContain('news-article')
    expect((await knowledge.read({ id: first.id })).source).toBe('external')
    const again = await knowledge.saveText(request)
    expect(again.id).toBe(first.id)
    const different = await knowledge.saveText({ ...request, sourceUrl: 'https://example.com/other-article' })
    expect(different.id).not.toBe(first.id)
    await expect(knowledge.saveText({ ...request, sourceUrl: '' })).rejects.toThrow('knowledge: source URL and content are required')
    // A malformed Remote call from the browser can omit a field entirely; TypeScript cannot guard that at the wire boundary.
    await expect(knowledge.saveText({ ...request, sourceUrl: undefined as unknown as string })).rejects.toThrow('knowledge: source URL and content are required')
  } finally {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
