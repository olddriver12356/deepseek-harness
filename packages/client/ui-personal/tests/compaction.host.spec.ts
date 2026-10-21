import { mkdtemp, writeFile, rm, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { request as httpRequest } from 'node:http'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Sessions from '@deepseek-ai/dsh-session'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import * as Personal from '../src/index.ts'

function request(port: number, path: string, cookie = '', body?: unknown) {
  return new Promise<{ status: number; body: string; cookie: string }>((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk: string) => { text += chunk })
      res.on('end', () => { resolve({ status: res.statusCode!, body: text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? '' }) })
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
const signal = (statement: string, key: string, type = 'communication_preference') => ({
  candidate_statement: statement, claim_type: type, signal_kind: 'explicit', polarity: 'support',
  scope_kind: 'global', confidence: 0.95, inference_basis: '用户明确表达的长期沟通偏好', concept_key: key,
})

it('proposes through the default model and applies only owner-accepted stored items through Loader', { timeout: 180000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-compaction-'))
  const ctx = new Context()
  const calls: GenerateOptions[] = []
  let output = ''
  const model = { apply(context: Context) {
    context.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'fixture', model: 'tidy' }) } as never)
    context.provide('llm', {
      async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
        calls.push(options)
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: output }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: output } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    } as never)
  } }
  try {
    const path = join(root, 'cordis.yml')
    await writeFile(path, [
      '- name: credentials', '  config:', `    path: '${join(root, 'credentials.yml')}'`, '    watch: false',
      '- name: web', '  config:', '    host: 127.0.0.1', '    port: 0',
      '- name: connection', '- name: prompt', '- name: tools', '- name: sessions', '- name: model',
      '- id: personal', '  name: personal', '  config:', `    vaultRoot: '${join(root, 'vault')}'`,
      `    personalCoreRoot: '${join(root, 'private')}'`, '    python: python', '    requestTimeoutMs: 120000',
      `    ideasVaultRoot: '${join(root, 'ideas')}'`, '    compaction:',
      '      maxInputBytes: 16000', '      maxOutputTokens: 1500', '      maxOutputBytes: 16000', '      timeoutMs: 5000',
    ].join('\n'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader); ctx.loader.builtins.include = Include
    const modules: Record<string, unknown> = {
      credentials: Credentials, web: WebServer, connection: Connection, prompt: SystemPrompt,
      tools: Tools, sessions: Sessions, model, personal: Personal,
    }
    ctx.loader.internal = {
      loadCache: new Map(),
      register(): never { throw new Error('Unexpected test loader registration') },
      getOrCreateModuleJob(): never { throw new Error('Unexpected test module job') },
      resolveSync(): never { throw new Error('Unexpected test module resolution') },
      load(): never { throw new Error('Unexpected test module load') },
      version: 'v2', async import(name: string) { return modules[name] } }
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } }); await ctx.loader.await()
    const port = ctx.webServer.port
    if (port === undefined) throw new Error('Web server did not start')
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/', handler: (req, res) => { if (ctx.connection.authorizeIndex(req, res)) res.end('ok') } }))
    const launch = new URL(ctx.connection.authenticatedUrl(`http://127.0.0.1:${port}/`))
    const cookie = (await request(port, launch.pathname + launch.search)).cookie
    const api = async (body?: unknown) => { const response = await request(port, '/personal/api/compaction', cookie, body); return { status: response.status, value: JSON.parse(response.body) as Record<string, unknown> } }
    const bok = async (route: string, body?: unknown): Promise<unknown> => JSON.parse((await request(port, `/personal/api/bok/v1/person/${route}`, cookie, body)).body)
    expect((await request(port, '/personal/api/compaction')).status).toBe(401)
    const observe = ctx.tools.get('bok_observe_conversation')!
    const run = { signal: new AbortController().signal } as never
    const statements = ['用户偏好先给出结论。', '用户希望回答开门见山，先说结论。', '用户偏好使用表格比较数据。']
    await expect(observe.execute({ conversation_id: 'c', turn_id: 'en', role: 'user', content: 'x', agent: 'dsh', personal_signals: [signal('The user likes tables.', 'communication.tables-en')] }, run)).rejects.toThrow('Simplified Chinese')
    for (const [index, statement] of statements.entries()) {
      await observe.execute({ conversation_id: 'c', turn_id: String(index), role: 'user', content: ['Please always lead with the conclusion from now on.', 'Get straight to the point and put the answer first, always.', 'Whenever you compare numbers, use a table.'][index]!, agent: 'dsh', personal_signals: [signal(statement, `communication.case-${index}`)] }, run)
    }
    await observe.execute({ conversation_id: 'c', turn_id: 'work', role: 'user', content: 'I always review diffs before committing anything.', agent: 'dsh', personal_signals: [signal('用户提交前总会先审阅差异。', 'work.review-diff', 'work_preference')] }, run)
    await bok('observations/process', { limit: 20 })
    const listed = (await bok('dashboard?limit=500')) as { claims: Record<string, { id: string; statement: string; effective: boolean }[]> }
    const effective = Object.values(listed.claims).flat().filter(claim => claim.effective)
    const ids = statements.map(statement => effective.find(claim => claim.statement === statement)!.id)
    const work = effective.find(claim => claim.statement === '用户提交前总会先审阅差异。')!.id
    // An existing non-Chinese claim is a translation candidate.
    await bok('claims/correct', { claim_id: ids[2], statement: 'The user prefers tables when comparing data.', source_ref: 'test:owner' })
    expect((await api()).value).toEqual({ claims: 4, private: 4, untranslated: 1 })

    output = JSON.stringify({ merges: [{ ids: [ids[0], 'person-' + '0'.repeat(32)], statement: '用户偏好先给结论。' }], translations: [] })
    expect((await api({ action: 'propose' })).value.message).toContain('unknown or repeated claim')
    output = JSON.stringify({ merges: [{ ids: [ids[0], work], statement: '用户偏好先给结论并审阅差异。' }], translations: [] })
    expect((await api({ action: 'propose' })).value.message).toContain('must share type, scope and sensitivity')
    output = JSON.stringify({ merges: [{ ids: [ids[0], ids[1]], statement: 'The user wants conclusions first.' }], translations: [] })
    expect((await api({ action: 'propose' })).value.message).toContain('Simplified Chinese')
    output = '```json\n' + JSON.stringify({ merges: [{ ids: [ids[0], ids[1]], statement: '用户偏好回答开门见山，先给出结论。' }], translations: [{ id: ids[2], statement: '用户比较数据时偏好使用表格。' }] }) + '\n```'
    const proposal = (await api({ action: 'propose' })).value as { id: string; items: { kind: string; statement: string }[] }
    expect(proposal.items.map(item => [item.kind, item.statement])).toEqual([['merge', '用户偏好回答开门见山，先给出结论。'], ['translate', '用户比较数据时偏好使用表格。']])
    expect(calls.at(-1)).toMatchObject({ provider: 'fixture', model: 'tidy', tools: [], maxTokens: 1500 })
    expect(JSON.stringify(calls.at(-1)!.messages)).toContain('The user prefers tables when comparing data.')
    const receipts = join(root, 'private/.bok/dsh-compaction')
    const receiptNames = await readdir(receipts)
    expect(receiptNames).toEqual(expect.arrayContaining([`${proposal.id}.request.json`, `${proposal.id}.proposal.json`]))
    expect((JSON.parse(await readFile(join(receipts, `${proposal.id}.request.json`), 'utf8')) as { request: { system: unknown } }).request.system).toBe(calls.at(-1)!.system)

    expect((await api({ action: 'apply', id: proposal.id, accepted: [5] })).value).toMatchObject({ error: 'compaction_failed', message: 'Invalid accepted compaction items' })
    const result = (await api({ action: 'apply', id: proposal.id, accepted: [0] })).value as { backup_id: string; applied: { kind: string; id: string; merged: string[] }[]; error: string }
    expect(result).toMatchObject({ error: '', applied: [{ kind: 'merge', merged: [ids[0], ids[1]] }] })
    expect(result.backup_id).not.toBe('')
    expect((await api({ action: 'apply', id: proposal.id, accepted: [1] })).value.message).toContain('already applied')
    const after = (await bok('dashboard?limit=500')) as { claims: Record<string, { id: string; statement: string; effective: boolean }[]> }
    const live = [...new Set(Object.values(after.claims).flat().filter(claim => claim.effective).map(claim => claim.statement))].sort()
    expect(live).toEqual(['The user prefers tables when comparing data.', '用户偏好回答开门见山，先给出结论。', '用户提交前总会先审阅差异。'].sort())
    expect((await api()).value).toEqual({ claims: 3, private: 3, untranslated: 1 })

    output = JSON.stringify({ merges: [], translations: [{ id: ids[2], statement: '用户比较数据时偏好使用表格。' }] })
    const stale = (await api({ action: 'propose' })).value as { id: string }
    await bok('claims/correct', { claim_id: ids[2], statement: 'The user prefers tables for comparisons.', source_ref: 'test:owner' })
    expect((await api({ action: 'apply', id: stale.id, accepted: [0] })).value.message).toContain('changed after the proposal')
    const fiber = [...ctx.loader.entries()].find(entry => entry.options.id === 'personal')!.fiber!
    await fiber.dispose()
    expect((await request(port, '/personal/api/compaction', cookie)).status).toBe(404)
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
