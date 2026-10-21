import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import LocalSubprocess from '@deepseek-ai/dsh-subprocess-local'
import { configurationFixture } from '../../../settings/settings/tests/configuration-fixture.ts'
import AppsService, { Config } from '../src/index.ts'
import type { Config as AppsConfig } from '../src/index.ts'
import type { AppRegistration } from '../src/types.ts'
import { expect, it, vi } from 'vitest'

it('persists explicit registrations and removes only the registry record', async () => {
  const { ctx, start } = await configurationFixture({ schema: Config, apply: (owner, config) => {
    if (owner.fiber.entry?.options.id !== 'first') return
    owner.plugin(LocalSubprocess)
    owner.inject(['subprocess', 'settings'], (ctx) => { new AppsService(ctx, config as AppsConfig) })
  } })
  await vi.waitFor(() => { expect(ctx.get('apps')).toBeDefined() })
  const service = ctx.get('apps') as AppsService
  const directory = await mkdtemp(join(tmpdir(), 'dsh-registry-'))
  try {
    const manifest = JSON.stringify({ scripts: { dev: 'node server.js' } })
    await writeFile(join(directory, 'package.json'), manifest)
    const registration: AppRegistration = { id: '', name: 'Test', description: '', directory, packageManager: 'npm', script: 'dev', url: 'http://localhost:3000', port: 3000, strategy: 'fixed' }
    const saved = await service.save({ registration })
    expect((await service.list()).apps[0]?.id).toBe(saved.id)
    const desktop = await service.save({ registration: { ...registration, kind: 'desktop', executable: process.execPath, directory: '', name: 'Desktop' } })
    expect(desktop.executable).toBe(process.execPath)
    expect(desktop.directory).toBe(dirname(process.execPath))
    await expect(service.save({ registration: { ...registration, kind: 'desktop', executable: process.execPath, directory: '', name: 'Duplicate' } })).rejects.toThrow('already registered')
    await service.unregister({ id: desktop.id })
    await expect(service.save({ registration })).rejects.toThrow('already registered')
    await ctx.fiber.dispose()
    const restored = await start()
    await vi.waitFor(() => { expect(restored.get('apps')).toBeDefined() })
    const restarted = restored.get('apps') as AppsService
    expect((await restarted.list()).apps[0]?.id).toBe(saved.id)
    await restarted.unregister({ id: saved.id })
    expect((await restarted.list()).apps).toEqual([])
    expect(await readFile(join(directory, 'package.json'), 'utf8')).toBe(manifest)
  } finally {
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
})
