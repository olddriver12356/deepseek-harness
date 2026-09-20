import { mkdtemp, rm, writeFile, readdir, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { request as httpRequest } from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as Personal from '../src/index.ts'
import { PersonalWorker } from '../src/worker.ts'

let ctx: Context | undefined
let root: string | undefined
afterEach(async () => { await ctx?.fiber.dispose(); if (root) await rm(root, { recursive: true, force: true }) })

function request(port: number, path: string, cookie = '', method = 'GET', body = '', origin?: string) {
  return new Promise<{ status: number; body: string; cookie: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method, headers: { cookie, 'content-type': 'application/json', ...(origin ? { origin } : {}) } }, (res) => {
      let data = ''; res.setEncoding('utf8'); res.on('data', (part) => { data += part })
      res.on('end', () => resolve({ status: res.statusCode!, body: data, headers: res.headers, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? '' }))
    }); req.on('error', reject); req.end(body)
  })
}

it('mounts the real Bok page with auth, privacy, durable observations, and reversible plugin lifecycle', { timeout: 60000 }, async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-personal-'))
  const ideasVault = join(root, 'ideas-vault')
  const guardDir = join(ideasVault, 'Workspace/Projects/Central Hub/Sync')
  await mkdir(guardDir, { recursive: true })
  const guard = join(guardDir, 'Invoke-VaultSyncGuard.ps1')
  await writeFile(guard, 'param([string]$Mode)\nif ($Mode -ne "Assert") { exit 1 }\nexit 0')
  const path = join(root, 'cordis.yml')
  await writeFile(path, [
    '- name: credentials', '  config:', `    path: '${join(root, 'credentials.yml')}'`, '    watch: false',
    '- name: web', '  config:', '    host: 127.0.0.1', '    port: 0',
    '- name: connection', '- name: prompt', '- name: tools',
    '- id: personal', '  name: personal', '  config:', `    vaultRoot: '${join(root, 'vault')}'`,
    `    personalCoreRoot: '${join(root, 'private')}'`, '    python: python', '    requestTimeoutMs: 30000',
    `    ideasVaultRoot: '${ideasVault}'`,
  ].join('\n'))
  ctx = new Context(); ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader); ctx.loader.builtins.include = Include
  const modules: Record<string, unknown> = {
    credentials: Credentials, web: WebServer, connection: Connection, prompt: SystemPrompt, tools: Tools, personal: Personal,
  }
  ctx.loader.internal = { version: 'v2', async import(name: string) { if (!modules[name]) throw new Error(name); return modules[name] } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } }); await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.fiber && !entry.disabled)).toEqual([])
  const port = ctx.webServer.port
  const removeLogin = ctx.webServer.register({ kind: 'exact', path: '/', handler: (req, res) => { if (ctx!.connection.authorizeIndex(req, res)) res.end('ok') } })
  const launch = new URL(ctx.connection.authenticatedUrl(`http://127.0.0.1:${port}/`))
  const login = await request(port, launch.pathname + launch.search)
  const cookie = login.cookie
  expect(cookie).not.toBe('')
  expect((await request(port, '/personal/')).status).toBe(401)
  const note = { id: 'e39294e0-14e6-4c22-a393-13ca52231cc7', text: '  A raw idea\n\n[[Knowledge]] with a link.  ' }
  const noteBody = JSON.stringify(note)
  expect((await request(port, '/personal/api/quick-note', '', 'POST', noteBody)).status).toBe(401)
  expect((await request(port, '/personal/api/quick-note', cookie, 'POST', noteBody, 'https://evil.invalid')).status).toBe(403)
  const [saved, retry] = await Promise.all([request(port, '/personal/api/quick-note', cookie, 'POST', noteBody), request(port, '/personal/api/quick-note', cookie, 'POST', noteBody)])
  expect(saved.status).toBe(200); expect(retry.status).toBe(200)
  const savedPath = JSON.parse(saved.body).path
  expect(savedPath).toMatch(/^Ideas\/Draft\/Quick note /)
  expect(await readdir(join(ideasVault, 'Ideas/Draft'))).toEqual([savedPath.split('/').at(-1)])
  expect(await readFile(join(ideasVault, savedPath), 'utf8')).toContain(`\n---\n\n${note.text}\n`)
  expect((await request(port, '/personal/api/quick-note', cookie, 'POST', JSON.stringify({ ...note, text: 'different' }))).status).toBe(400)
  expect((await request(port, '/personal/api/quick-note', cookie, 'POST', JSON.stringify({ id: '../../outside', text: 'x' }))).status).toBe(400)
  expect((await request(port, '/personal/api/quick-note', cookie, 'POST', JSON.stringify({ ...note, text: 'x'.repeat(20001) }))).status).toBe(400)
  await writeFile(guard, 'exit 1')
  expect((await request(port, '/personal/api/quick-note', cookie, 'POST', JSON.stringify({ ...note, id: '30cdd965-b957-40bc-b2dd-32cb78c97910' }))).status).toBe(400)
  expect(await readdir(join(ideasVault, 'Ideas/Draft'))).toHaveLength(1)
  expect((await request(port, '/personal/quick-note.html', cookie)).body).toContain('noteForm')
  expect((await request(port, '/personal/api/bok/v1/person/dashboard', cookie, 'GET', '', 'https://evil.invalid')).status).toBe(403)
  const page = await request(port, '/personal/', cookie)
  expect(page.status).toBe(200)
  expect(['我的画像', '理解图谱', '需要我介入', '证据与结果', '清理'].map(label => page.body.includes(label))).toEqual([true, true, true, true, true])
  expect((await request(port, '/personal/assets/../../Bok/bok_core/config.py', cookie)).status).toBe(404)
  expect((await request(port, '/personal/api/bok/v1/auth/rotate', cookie, 'POST', '{}')).status).toBe(405)
  const dashboard = await request(port, '/personal/api/bok/v1/person/dashboard?limit=500', cookie)
  expect(dashboard.status).toBe(200)
  expect(JSON.parse(dashboard.body).configured).toBe(true)
  expect(dashboard.body).not.toContain(root)
  expect(await readdir(join(root, 'private'))).toContain('PERSONAL-CORE.md')
  const definition = ctx.tools.get('bok_observe_conversation')!
  expect(definition).toBeDefined()
  const result = await definition.execute({ conversation_id: 'test', turn_id: 'private', role: 'user', content: 'do not retain this text', agent: 'dsh', memory_mode: 'do_not_remember' }, { signal: new AbortController().signal } as never)
  expect(result).toMatchObject({ ok: true, status: 'excluded_do_not_remember' })
  expect(result).toMatchSnapshot('private-turn acknowledgement')
  const read = ctx.tools.get('bok_person_context')!
  expect(await read.execute({ task: 'write code', agent: 'dsh' }, { signal: new AbortController().signal } as never)).toMatchObject({ claims: [] })
  await definition.execute({ conversation_id: 'identity', turn_id: '1', role: 'user',
    content: '这是一个需要长期记住的身份说明。', agent: 'dsh', personal_signals: [{
      candidate_statement: '用户提出了一项可能影响长期回答的身份信息。', claim_type: 'identity',
      signal_kind: 'explicit', polarity: 'support', scope_kind: 'global', confidence: 0.99,
      inference_basis: '用户直接提供了长期身份说明', concept_key: 'identity.long-term-description',
    }] }, { signal: new AbortController().signal } as never)
  const post = async (route: string, payload: unknown) => request(port, `/personal/api/bok/v1/person/${route}`, cookie, 'POST', JSON.stringify(payload))
  const profile = async (payload: unknown) => request(port, '/personal/api/vault-profile', cookie, 'POST', JSON.stringify(payload))
  await writeFile(guard, 'exit 0')
  await mkdir(join(ideasVault, 'Memory/Semantic'), { recursive: true })
  await writeFile(join(ideasVault, 'Memory/Semantic/Profile.md'), 'Existing owner profile.\n')
  expect((await request(port, '/personal/api/vault-profile')).status).toBe(401)
  expect((await request(port, '/personal/api/vault-profile', cookie, 'POST', '{}', 'https://evil.invalid')).status).toBe(403)
  expect((await post('observations/process', { limit: 20 })).status).toBe(200)
  const pending = JSON.parse((await request(port, '/personal/api/bok/v1/person/dashboard', cookie)).body)
  const claim = pending.claims.review_required[0]
  expect(claim.claim_type).toBe('identity')
  expect(claim.effective).toBe(false)
  expect((await post('claims/authorize', { claim_id: claim.id, access_scope: ['all-agents'] })).status).toBe(409)
  expect((await post('claims/confirm', { claim_id: claim.id, source_ref: 'test:user' })).status).toBe(200)
  expect(await read.execute({ task: '身份', agent: 'dsh' }, { signal: new AbortController().signal } as never)).toMatchObject({ claims: [] })
  expect((await post('claims/authorize', { claim_id: claim.id, access_scope: ['agent:dsh'] })).status).toBe(200)
  const recalled = await read.execute({ task: '身份', agent: 'dsh' }, { signal: new AbortController().signal } as never) as { claims: unknown[] }
  expect(recalled.claims).toHaveLength(1)
  expect(JSON.parse((await profile({ action: 'status' })).body).items).toHaveLength(0)
  expect((await post('claims/authorize', { claim_id: claim.id, access_scope: ['all-agents'] })).status).toBe(200)
  let profileRow = JSON.parse((await profile({ action: 'status' })).body).items[0]
  expect(profileRow.status).toBe('not_exported')
  expect((await profile({ action: 'export', id: '../../Profile', version: 1 })).status).toBe(409)
  expect((await profile({ action: 'export', id: claim.id, version: profileRow.version })).status).toBe(409)
  expect((await profile({ action: 'export', id: claim.id, version: profileRow.version, confirm: true })).status).toBe(200)
  const projection = join(ideasVault, `Memory/Semantic/profile/${claim.id}.md`)
  const originalProjection = await readFile(projection, 'utf8')
  const edited = originalProjection.replace(/<!-- statement:start -->\n[\s\S]*?\n<!-- statement:end -->/, '<!-- statement:start -->\nThe owner prefers explicit context for identity claims.\n<!-- statement:end -->')
  await writeFile(projection, edited)
  profileRow = JSON.parse((await profile({ action: 'status' })).body).items[0]
  expect(profileRow.status).toBe('vault_changed')
  expect((await profile({ action: 'apply', id: claim.id, version: profileRow.version, preview: profileRow.preview })).status).toBe(409)
  expect((await profile({ action: 'apply', id: claim.id, version: profileRow.version, preview: 'stale', confirm: true })).status).toBe(409)
  expect((await profile({ action: 'apply', id: claim.id, version: profileRow.version, preview: profileRow.preview, confirm: true })).status).toBe(200)
  profileRow = JSON.parse((await profile({ action: 'status' })).body).items[0]
  expect(profileRow).toMatchObject({ status: 'synced', statement: 'The owner prefers explicit context for identity claims.' })
  expect(await readFile(join(ideasVault, 'Memory/Semantic/Profile.md'), 'utf8')).toBe('Existing owner profile.\n')
  await writeFile(projection, (await readFile(projection, 'utf8')).replace('The owner prefers explicit context for identity claims.', 'An owner edit awaiting review.'))
  expect((await post('claims/correct', { claim_id: claim.id, statement: 'A newer Core version.', source_ref: 'test:concurrent' })).status).toBe(200)
  profileRow = JSON.parse((await profile({ action: 'status' })).body).items[0]
  expect(profileRow.status).toBe('conflict')
  expect((await profile({ action: 'apply', id: claim.id, version: profileRow.version, preview: profileRow.preview, confirm: true })).status).toBe(409)
  expect((await profile({ action: 'export', id: claim.id, version: profileRow.version, preview: profileRow.preview, confirm: true })).status).toBe(200)
  expect(await readFile(projection, 'utf8')).toContain('A newer Core version.')
  await writeFile(guard, 'exit 1')
  const revokeProjection = await post('claims/authorize', { claim_id: claim.id, access_scope: ['agent:dsh'] })
  expect(revokeProjection.status).toBe(200)
  expect(revokeProjection.headers['x-vault-profile-warning']).toBeTruthy()
  expect((await profile({ action: 'status' })).status).toBe(409)
  await writeFile(guard, 'exit 0')
  expect(JSON.parse((await profile({ action: 'status' })).body)).toMatchObject({ items: [], withdrawn: 1 })
  expect(await readFile(projection, 'utf8')).not.toContain('A newer Core version.')
  expect(await readFile(projection, 'utf8')).toContain('status: withdrawn')
  const impact = ctx.tools.get('bok_record_person_impact')!
  const outcome = ctx.tools.get('bok_record_person_outcome')!
  await expect(impact.execute({ answer_ref: 'test:answer', task: '身份', agent: 'dsh', claim_ids: [claim.id] }, { signal: new AbortController().signal } as never)).resolves.toMatchObject({ answer_ref: 'test:answer' })
  await expect(outcome.execute({ answer_ref: 'test:answer', outcome: 'positive', agent: 'dsh', claim_ids: [claim.id], source_ref: 'test:feedback', rating: 5 }, { signal: new AbortController().signal } as never)).resolves.toMatchObject({ outcome: 'positive' })
  expect((await post('claims/correct', { claim_id: claim.id, statement: '用户希望身份信息始终保留明确的适用情境。', source_ref: 'test:correction' })).status).toBe(200)
  expect((await post('backups/create', {})).status).toBe(200)
  expect((await post('claims/forget', { claim_id: claim.id })).status).toBe(403)
  expect((await post('claims/forget', { claim_id: claim.id, confirm_forget: true })).status).toBe(200)
  expect(await read.execute({ task: '身份', agent: 'dsh' }, { signal: new AbortController().signal } as never)).toMatchObject({ claims: [] })
  const credentialsPath = join(root, 'vault/.bok/state/agent-credentials.json')
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  expect(credentials.dsh.token_hash).toBeTruthy()
  expect(credentials.dsh.token).toBeUndefined()
  credentials.dsh.status = 'revoked'
  await writeFile(credentialsPath, JSON.stringify(credentials))
  await expect(read.execute({ task: '身份', agent: 'dsh' }, { signal: new AbortController().signal } as never)).rejects.toThrow()
  const fiber = [...ctx.loader.entries()].find(entry => entry.options.id === 'personal')!.fiber!
  await fiber.dispose()
  expect((await request(port, '/personal/', cookie)).status).toBe(404)
  expect(ctx.tools.get('bok_person_context')).toBeUndefined()
  removeLogin()
})

it('reports a Python launch failure instead of leaving startup pending', async () => {
  const worker = new PersonalWorker('.', 'missing-dsh-python-executable', '.', '.', 1000)
  await expect(worker.ready).rejects.toThrow()
  await worker.close()
})
