import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getPonytailInstructions, isDeactivationCommand, parsePonytailCommand } from '../src/instructions.ts'
import { readMode, writeMode } from '../src/state.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('parsePonytailCommand', () => {
  it('reads the requested level', () => {
    expect(parsePonytailCommand('/ponytail lite')).toBe('lite')
    expect(parsePonytailCommand('/ponytail ultra')).toBe('ultra')
    expect(parsePonytailCommand('/ponytail off')).toBe('off')
  })
  it('defaults to full when no level is given', () => {
    expect(parsePonytailCommand('/ponytail')).toBe('full')
  })
  it('ignores ordinary prose', () => {
    expect(parsePonytailCommand('add a normal mode toggle')).toBeUndefined()
  })
})

describe('isDeactivationCommand', () => {
  it('matches only the standalone phrase', () => {
    expect(isDeactivationCommand('stop ponytail')).toBe(true)
    expect(isDeactivationCommand('Normal Mode.')).toBe(true)
    expect(isDeactivationCommand('add a normal mode toggle')).toBe(false)
  })
})

describe('getPonytailInstructions', () => {
  it('keeps only the active level\'s intensity row and drops "off"', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-ponytail-'))
    roots.push(root)
    const skillPath = join(root, 'SKILL.md')
    await writeFile(skillPath, [
      '---',
      'name: ponytail',
      '---',
      '# Ponytail',
      '| Level | What changes |',
      '|-------|------|',
      '| **lite** | lite row |',
      '| **full** | full row |',
      '- full: an example line',
      '- lite: another example line',
    ].join('\n'))

    const full = getPonytailInstructions(skillPath, 'full')
    expect(full).toContain('full row')
    expect(full).not.toContain('lite row')

    const lite = getPonytailInstructions(skillPath, 'lite')
    expect(lite).toContain('lite row')
    expect(lite).not.toContain('full row')

    expect(getPonytailInstructions(skillPath, 'off')).toBe('')
  })

  it('falls back to the ladder\'s essence when the shared skill store is missing', () => {
    const text = getPonytailInstructions(join(tmpdir(), 'nowhere', 'SKILL.md'), 'full')
    expect(text).toContain('PONYTAIL MODE ACTIVE')
    expect(text).toContain('root cause')
  })
})

describe('readMode / writeMode', () => {
  it('round-trips a level through the state file and clears it on off', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-ponytail-state-'))
    roots.push(root)
    const statePath = join(root, 'ponytail-active')

    expect(readMode(statePath, 'full')).toBe('full')

    writeMode(statePath, 'ultra')
    expect(readMode(statePath, 'full')).toBe('ultra')

    writeMode(statePath, 'off')
    expect(readMode(statePath, 'full')).toBe('full')
  })
})
