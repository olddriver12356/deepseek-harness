import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import { apply as applyConnection } from '@deepseek-ai/dsh-client-connection'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import TypertRegistry from '@deepseek-ai/dsh-typert-registry'
import TypertGatewayService from '@deepseek-ai/dsh-api-gateway'
import { bindTypertRemote, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { createSandbox, evaluateHostCode } from '../../../extensions/cordis-host-runner/src/sandbox.ts'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

class AdmissionProbe extends Service {
  readonly typertRemote = bindTypertRemote(this, 'admissionProbe')
  readonly calls: string[] = []
  constructor(ctx: Context) { super(ctx, 'admissionProbe') }
  @Remote
  control(value: string): string {
    this.calls.push(value)
    return value
  }
}

it('a host helper constructor reaches the host process from the existing dynamic VM', async () => {
  const result = await evaluateHostCode(createSandbox('authority-probe'),
    'return btoa.constructor("return process")().pid', 'authority-probe', 1000)
  expect(result).toBe(process.pid)
})

it('the authenticated Gateway accepts a same-user shell cookie forged from a test-owned credential file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-collaboration-authority-'))
  cleanups.push(() => rm(home, { recursive: true, force: true }))
  const ctx = new Context()
  const routes: WebRoute[] = []
  ctx.provide('webServer', { register(route: WebRoute) { routes.push(route); return () => {} } })
  await ctx.plugin(LocalCredentialProvider, { dshHome: home, watch: false })
  await ctx.plugin({ inject: ['credentials'], apply: applyConnection })
  await ctx.plugin(TypertRegistry)
  await ctx.plugin(TypertGatewayService)
  await ctx.plugin(AdmissionProbe)
  const probe = ctx.get('admissionProbe') as AdmissionProbe
  const route = routes.find(candidate => candidate.path === '/api')!
  const server = createServer((req, res) => { void route.handler(req, res) })
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.close((error) => { if (error === undefined) resolve(); else reject(error) })
    server.closeAllConnections()
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const body = JSON.stringify({ type: 'client-request', rpcId: 'synthetic-attack',
    method: 'admissionProbe/control', payload: { args: { value: 'shell-admitted' } } })
  const unauthenticated = await fetch(`${origin}/api/admissionProbe/control`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  })
  expect(unauthenticated.status).toBe(401)
  await unauthenticated.text()

  // This child reads only this test's generated credentials; it never prints the secret or cookie.
  const program = `
    const { readFileSync } = require('node:fs');
    const { createHash, createHmac } = require('node:crypto');
    const text = readFileSync(process.argv[1], 'utf8');
    const secret = Buffer.from(text.match(/secret: ([A-Za-z0-9_-]+)/)[1], 'base64url');
    const origin = process.argv[2];
    const authority = new URL(origin).host;
    const now = Date.now();
    const payload = Buffer.from(JSON.stringify({ version: 1, authority, issuedAt: now,
      expiresAt: now + 60000 })).toString('base64url');
    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    const name = 'dsh-auth-' + createHash('sha256').update(authority).digest('base64url');
    fetch(origin + '/api/admissionProbe/control', { method: 'POST',
      headers: { 'content-type': 'application/json', cookie: name + '=v1.' + payload + '.' + signature },
      body: process.argv[3] }).then(async response => {
        const body = await response.json();
        console.log(JSON.stringify({ status: response.status, accepted: body.result.ok,
          value: body.result.value }));
      }).catch(() => { process.exitCode = 1; });
  `
  const child = spawn(process.execPath, ['-e', program, join(home, '.credentials.yaml'), origin, body],
    { env: {}, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  cleanups.push(async () => { if (child.exitCode === null) child.kill(); await exited })
  let output = ''
  child.stdout.on('data', (chunk) => { output += String(chunk) })
  expect(await exited).toBe(0)
  expect(JSON.parse(output)).toEqual({ status: 200, accepted: true, value: 'shell-admitted' })
  expect(probe.calls).toEqual(['shell-admitted'])
})
