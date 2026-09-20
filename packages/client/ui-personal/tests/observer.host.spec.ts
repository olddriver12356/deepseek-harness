import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
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
import Sessions, { SessionId, KNOWN_SESSION_EVENT_TYPES, type Session } from '@deepseek-ai/dsh-session'
import { createUserMessage, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import * as Personal from '../src/index.ts'

function request(port: number, path: string, cookie = '', body?: unknown) {
  return new Promise<{ status: number; body: string; cookie: string }>((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode!, body: text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? '' }))
    }); req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}
const source = 'For all future explanations, please lead with a short conclusion and then explain the reasons only when they are useful.'
const observation = { message_index: 0, evidence: 'lead with a short conclusion', signal: {
  candidate_statement: 'The user values concise conclusions before supporting detail in explanations.',
  claim_type: 'communication_preference', signal_kind: 'explicit', polarity: 'support', scope_kind: 'global', confidence: 0.95,
  inference_basis: 'Explicit enduring communication preference', concept_key: 'communication.conclusion-first',
} }

it('observes live human turns through Loader, preserves privacy, logs requests, and supports pause and disposal', { timeout: 180000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-observer-'))
  const ctx = new Context()
  const calls: GenerateOptions[] = []
  let output = JSON.stringify({ observations: [observation] })
  let waitForAbort = false
  const model = { apply(context: Context) { context.provide('llm', {
    async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
      calls.push(options)
      if (waitForAbort) {
        await new Promise<void>(resolve => options.signal!.addEventListener('abort', () => resolve(), { once: true }))
        options.signal!.throwIfAborted()
      }
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: output }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: output } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  } as never) } }
  try {
    const path = join(root, 'cordis.yml')
    await writeFile(path, [
      '- name: credentials', '  config:', `    path: '${join(root, 'credentials.yml')}'`, '    watch: false',
      '- name: web', '  config:', '    host: 127.0.0.1', '    port: 0',
      '- name: connection', '- name: prompt', '- name: tools', '- name: sessions', '- name: model',
      '- id: personal', '  name: personal', '  config:', `    vaultRoot: '${join(root, 'vault')}'`,
      `    personalCoreRoot: '${join(root, 'private')}'`, '    python: python', '    requestTimeoutMs: 120000',
      `    ideasVaultRoot: '${join(root, 'ideas')}'`, '    observer:', '      enabled: true',
      '      maxInputBytes: 16000', '      maxOutputTokens: 1500', '      maxOutputBytes: 16000',
      '      maxPendingTurns: 2', '      timeoutMs: 1000',
    ].join('\n'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader); ctx.loader.builtins.include = Include
    const modules: Record<string, unknown> = {
      credentials: Credentials, web: WebServer, connection: Connection, prompt: SystemPrompt,
      tools: Tools, sessions: Sessions, model, personal: Personal,
    }
    ctx.loader.internal = { version: 'v2', async import(name: string) { return modules[name] } } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(path).href } }); await ctx.loader.await()
    const port = ctx.webServer.port
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/', handler: (req, res) => { if (ctx.connection.authorizeIndex(req, res)) res.end('ok') } }))
    const launch = new URL(ctx.connection.authenticatedUrl(`http://127.0.0.1:${port}/`))
    const cookie = (await request(port, launch.pathname + launch.search)).cookie
    const status = async () => JSON.parse((await request(port, '/personal/api/observer', cookie)).body)
    expect((await request(port, '/personal/api/observer')).status).toBe(401)
    expect(await status()).toMatchObject({ enabled: true, status: 'idle' })
    const session = ctx.sessions.create(SessionId('observer-human'))
    function turn(target: Session, n: number, text = source, human = true) {
      target.append('turn/start', { turn: n })
      target.append('request/header', { reason: 'initial', header: { config: { provider: 'fixture', model: 'memory' } } })
      target.append('user/message', createUserMessage({ content: [{ type: 'text', text }], source: human ? { kind: 'user' } : { kind: 'plugin', plugin: 'fixture' } }), { surfaceOp: 'append' })
      return target.append('turn/end', { turn: n, reason: { kind: 'completed' } })
    }
    const end = turn(session, 1)
    expect(calls).toHaveLength(0) // Model work cannot run inside turn/end publication.
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(calls).toHaveLength(1)
    expect(await status()).toMatchObject({ status: 'observed', observations: 1 })
    expect(calls[0]!.messages[0]!.content).toEqual([{ type: 'text', text: expect.stringContaining(JSON.stringify([source])) }])
    const logged = session.snapshotEvents().find(event => event.type === 'personal/observation-request')!
    expect(KNOWN_SESSION_EVENT_TYPES.has('personal/observation-request')).toBe(true)
    expect(KNOWN_SESSION_EVENT_TYPES.has('personal/observation-result')).toBe(true)
    expect(logged.data).toMatchObject({ turn: 1, request: { provider: 'fixture', model: 'memory' } })
    expect(calls[0]!.system).toMatchSnapshot('observer extraction instructions')
    const dashboard = JSON.parse((await request(port, '/personal/api/bok/v1/person/dashboard', cookie)).body)
    expect(JSON.stringify(dashboard)).toContain(observation.signal.candidate_statement)
    ctx.emit('session/event', session, end)
    turn(session, 2, 'Do not remember this: I prefer very long reports.')
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'excluded_private' })
    turn(session, 3, 'My password is not a personal preference.')
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'excluded_sensitive' })
    turn(session, 4, source, false)
    turn(ctx.sessions.create(SessionId('observer-child'), { meta: { origin: 'subagent' } }), 1)
    turn(session, 40, '界'.repeat(16000))
    const restored = ctx.sessions.create(SessionId('observer-restored'), { seed: session.snapshotEvents() })
    ctx.emit('session/event', restored, end)
    expect(calls).toHaveLength(1)
    expect((await request(port, '/personal/api/observer', cookie, { enabled: false })).status).toBe(200)
    expect(JSON.parse(await readFile(join(root, 'vault/dsh-observer.json'), 'utf8'))).toEqual({ enabled: false })
    turn(session, 5)
    expect(calls).toHaveLength(1)
    expect((await request(port, '/personal/api/observer', cookie, { enabled: true })).status).toBe(200)
    output = JSON.stringify({ observations: [{ ...observation, evidence: 'invented evidence' }] })
    turn(session, 6)
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'failed' })
    output = JSON.stringify({ observations: [] })
    turn(session, 7)
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'no_signal', observations: 0 })
    const statePath = join(root, 'vault/.bok/state/agent-credentials.json')
    const credentials = JSON.parse(await readFile(statePath, 'utf8'))
    credentials.dsh.status = 'revoked'; await writeFile(statePath, JSON.stringify(credentials))
    const count = calls.length
    turn(session, 8)
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'access_revoked' })
    expect(calls).toHaveLength(count)
    credentials.dsh.status = 'active'; await writeFile(statePath, JSON.stringify(credentials))
    waitForAbort = true
    turn(session, 9)
    await expect.poll(() => calls.length).toBe(count + 1)
    turn(session, 10)
    turn(session, 11)
    expect(await status()).toMatchObject({ status: 'queue_full', pending: 2 })
    expect((await request(port, '/personal/api/observer', cookie, { enabled: false })).status).toBe(200)
    expect(calls.at(-1)!.signal!.aborted).toBe(true)
    expect((await request(port, '/personal/api/observer', cookie, { enabled: true })).status).toBe(200)
    turn(session, 12)
    await expect.poll(async () => (await status()).pending, { timeout: 5000 }).toBe(0)
    expect(await status()).toMatchObject({ status: 'failed' })
    expect(calls.at(-1)!.signal!.aborted).toBe(true)
    waitForAbort = false
    output = 'x'.repeat(16001)
    turn(session, 13)
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'failed' })
    output = JSON.stringify({ observations: [{ ...observation, signal: { ...observation.signal, confidence: 2 } }] })
    turn(session, 14)
    await expect.poll(async () => (await status()).pending).toBe(0)
    expect(await status()).toMatchObject({ status: 'failed' })
    const finalCount = calls.length
    const fiber = [...ctx.loader.entries()].find(entry => entry.options.id === 'personal')!.fiber!
    await fiber.dispose()
    turn(session, 15)
    expect(calls).toHaveLength(finalCount)
    expect((await request(port, '/personal/api/observer', cookie)).status).toBe(404)
  } finally { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) }
})
