import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { inspectProject, validateAppUrl } from '../src/manifest.ts'

it('inspects scripts without mutation and exposes conflicting runner evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-apps-'))
  try {
    const file = join(directory, 'package.json')
    const original = JSON.stringify({ name: 'example', scripts: { dev: 'vite' }, packageManager: 'pnpm@10.0.0' })
    await writeFile(file, original)
    await writeFile(join(directory, 'package-lock.json'), '{}')
    const result = await inspectProject(directory)
    expect(result.scripts).toEqual({ dev: 'vite' })
    expect(result.packageManagers).toEqual(['pnpm', 'npm'])
    expect(await readFile(file, 'utf8')).toBe(original)
    await writeFile(file, JSON.stringify({ scripts: { dev: 123 } }))
    await expect(inspectProject(directory)).rejects.toThrow('non-empty strings')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

it('accepts loopback destinations and rejects remote or credential-bearing URLs', () => {
  expect(validateAppUrl('http://localhost:3000')).toBe('http://localhost:3000/')
  expect(validateAppUrl('http://[::1]:3000/app')).toBe('http://[::1]:3000/app')
  for (const url of ['https://example.com', 'file:///tmp/app', 'http://user:secret@localhost:3000']) {
    expect(() => validateAppUrl(url)).toThrow()
  }
})
