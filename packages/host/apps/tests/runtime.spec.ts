import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import { AppsRuntime } from '../src/runtime.ts'
import type { AppRegistration } from '../src/types.ts'

it('launches on the next free port, deduplicates, captures logs and stops its tree', async () => {
  const ctx = new Context()
  const fiber = await ctx.plugin(LocalSubprocess)
  const dir = await mkdtemp(join(tmpdir(), 'dsh-launch-'))
  const listener = createServer()
  await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve))
  const port = (listener.address() as { port: number }).port
  const runtime = new AppsRuntime(ctx.subprocess, { startupTimeoutMs: 15000, graceMs: 1000, logBytes: 1024, portAttempts: 20 })
  try {
    await writeFile(join(dir, 'package.json'), JSON.stringify({ scripts: { start: 'node server.cjs' } }))
    await writeFile(join(dir, 'server.cjs'), "require('http').createServer((q,s)=>s.end('ready')).listen(Number(process.env.PORT),'127.0.0.1');console.log('fixture ready')")
    const app: AppRegistration = { id: 'fixture', name: 'Fixture', description: '', directory: dir, packageManager: 'npm', script: 'start', url: `http://127.0.0.1:${port}`, port, strategy: 'env' }
    await runtime.start(app)
    await runtime.start(app)
    for (let i = 0; i < 100 && runtime.snapshot(app).state === 'starting'; i++) await delay(200)
    expect(runtime.snapshot(app).error, JSON.stringify(runtime.logs(app.id))).toBe('')
    expect(runtime.snapshot(app).state).toBe('running')
    expect(new URL(runtime.snapshot(app).activeUrl).port).not.toBe(String(port))
    expect(runtime.logs(app.id).stdout).toContain('fixture ready')
    await runtime.stop(app.id)
    expect(runtime.snapshot(app).state).toBe('stopped')
    expect(listener.listening).toBe(true)
  } finally {
    await runtime.dispose()
    listener.close()
    await fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  }
}, 30000)
