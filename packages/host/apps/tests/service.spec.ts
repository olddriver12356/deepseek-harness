import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import { MemorySettings } from '../../../settings/settings/tests/memory.ts'
import AppsService from '../src/index.ts'
import type { AppRegistration } from '../src/types.ts'
import { expect, it } from 'vitest'

it('persists explicit registrations and removes only the registry record', async () => {
  const ctx = new Context()
  const settings = await ctx.plugin(MemorySettings)
  const subprocess = await ctx.plugin(LocalSubprocess)
  const fiber = await ctx.plugin(AppsService, { startupTimeoutMs: 2000, graceMs: 1000, logBytes: 1024, portAttempts: 5 })
  const service = ctx.get('apps') as AppsService
  const directory = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
  try {
    const manifest = JSON.stringify({ scripts: { dev: 'node server.js' } })
    await writeFile(join(directory, 'package.json'), manifest)
    const registration: AppRegistration = { id: '', name: 'Test', description: '', directory, packageManager: 'npm', script: 'dev', url: 'http://localhost:3000', port: 3000, strategy: 'fixed' }
    const saved = await service.save({ registration })
    expect((await service.list()).apps[0]?.id).toBe(saved.id)
    await expect(service.save({ registration })).rejects.toThrow('already registered')
    expect((ctx.settings as MemorySettings).persisted.length).toBe(1)
    await service.remove({ id: saved.id })
    expect((await service.list()).apps).toEqual([])
    expect(await readFile(join(directory, 'package.json'), 'utf8')).toBe(manifest)
  } finally {
    await fiber.dispose(); await subprocess.dispose(); await settings.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
