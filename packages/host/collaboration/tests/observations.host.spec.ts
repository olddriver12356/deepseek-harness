import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { observeGit } from '../src/observations.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('observes normal and linked checkout HEAD without invoking git or waking an Agent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-display-')); roots.push(root)
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n')
  expect(await observeGit(root)).toEqual({ kind: 'observed', root, branch: 'main', linkedWorktree: false })
  const linked = join(root, 'linked')
  const gitdir = join(root, '.git', 'worktrees', 'review')
  await mkdir(linked); await mkdir(gitdir, { recursive: true })
  await writeFile(join(linked, '.git'), `gitdir: ${gitdir}\n`)
  await writeFile(join(gitdir, 'HEAD'), 'ref: refs/heads/review\n')
  expect(await observeGit(linked)).toEqual({ kind: 'observed', root: linked, branch: 'review', linkedWorktree: true })
  await writeFile(join(gitdir, 'HEAD'), 'a'.repeat(40))
  expect(await observeGit(linked)).toMatchObject({ kind: 'observed', branch: null })
})

it('does not invent branch/worktree facts for malformed or absent metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-unknown-')); roots.push(root)
  expect(await observeGit(root)).toEqual({ kind: 'unavailable' })
  await writeFile(join(root, '.git'), 'invalid pointer')
  expect(await observeGit(root)).toEqual({ kind: 'unavailable' })
})

it('does not borrow a parent branch when the nearest checkout HEAD is missing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-git-nearest-')); roots.push(root)
  await mkdir(join(root, '.git'))
  await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/parent\n')
  const nested = join(root, 'nested')
  await mkdir(join(nested, '.git'), { recursive: true })
  expect(await observeGit(nested)).toEqual({ kind: 'unavailable' })
})
