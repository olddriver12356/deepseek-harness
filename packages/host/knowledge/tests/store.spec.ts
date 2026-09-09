import { mkdtemp, cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { KnowledgeStore } from '../src/store.ts'

it.skipIf(process.env['DSH_VAULT_ROOT'] === undefined)('reads a real Agent Layer and saves complete evidence without promotion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agent-layer-m2-'))
  try {
    await mkdir(join(root, 'Tools'))
    const source = process.env['DSH_VAULT_ROOT']
    if (source === undefined) throw new Error('Set DSH_VAULT_ROOT for the real Agent Layer bridge test')
    for (const file of ['AgentLayer.ps1', 'DshKnowledge.ps1']) await cp(join(source, 'Agents', 'Tools', file), join(root, 'Tools', file))
    await cp(join(source, 'Agents', 'Artifact Schema v1.md'), join(root, 'Artifact Schema v1.md'))
    const store = new KnowledgeStore(root)
    const content = '{"完整": "source"}\n'
    const saved = await store.save('test-session', 'A conversation', content)
    expect(saved.layer).toBe('1 Intake')
    expect((await store.save('test-session', 'Changed title', content)).id).toBe(saved.id)
    expect((await store.read(saved.id)).evidence).toBe(content)
    expect(await store.list()).toHaveLength(1)
    const article = 'Title: Fresh story\nSource: Test\nURL: https://example.com/story\n\nSummary text.'
    const newsSource = { kind: 'news', canonicalUrl: 'https://example.com/story', publisher: 'Test', retrievedAt: '2026-09-08T10:00:00.000Z' } as const
    const news = await store.save('news-fixed-key', 'Fresh story', article, newsSource)
    expect(news.layer).toBe('1 Intake')
    expect(news.topics).toContain('news-article')
    expect(news.topics).not.toContain('conversation')
    expect((await store.read(news.id)).evidence).toBe(article)
    expect((await store.read(news.id)).markdown).toContain('external_source')
    expect((await store.save('news-fixed-key', 'Fresh story', article, newsSource)).id).toBe(news.id)
    await writeFile(join(root, '.generated', 'write.lock'), 'occupied')
    await expect(store.save('other', 'Other', 'new')).rejects.toThrow(/lock/u)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 30_000)
