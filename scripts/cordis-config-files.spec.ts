import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { readCordisConfig } from './cordis-config-files.ts'

it('resolves only Git text symlinks and rejects cycles, missing targets and repository escape', () => {
  const parent = mkdtempSync(join(tmpdir(), 'dsh-config-link-'))
  const root = join(parent, 'repo')
  mkdirSync(root)
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  const link = (file: string, target: string): void => {
    writeFileSync(join(root, file), target)
    const hash = git('hash-object', '-w', file).trim()
    git('update-index', '--add', '--cacheinfo', `120000,${hash},${file}`)
  }
  try {
    git('init', '--quiet')
    writeFileSync(join(root, 'target.yml'), '- id: retained\n  name: example\n')
    link('cordis.yml', './target.yml')
    expect(readCordisConfig(root, 'cordis.yml')).toBe('- id: retained\n  name: example\n')
    writeFileSync(join(root, 'ordinary.yml'), './target.yml')
    expect(readCordisConfig(root, 'ordinary.yml')).toBe('./target.yml')
    link('chain.yml', './cordis.yml')
    expect(readCordisConfig(root, 'chain.yml')).toContain('id: retained')
    link('cordis.yml', './chain.yml')
    expect(() => readCordisConfig(root, 'cordis.yml')).toThrow('link cycle')
    link('cordis.yml', './missing.yml')
    expect(() => readCordisConfig(root, 'cordis.yml')).toThrow(/ENOENT/u)
    writeFileSync(join(parent, 'outside.yml'), '[]')
    link('cordis.yml', '../outside.yml')
    expect(() => readCordisConfig(root, 'cordis.yml')).toThrow('escapes repository')
  } finally {
    rmSync(parent, { recursive: true, force: true })
  }
})
