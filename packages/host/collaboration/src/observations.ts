/** Read-only workspace and Git metadata observations without loading Agents or Session history. */
import { lstat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ParticipantObservation } from './types.ts'

/**
 * Inspect the nearest checkout marker and its current HEAD, including linked worktrees.
 * @param cwd - current stored workspace path.
 * @returns current Git facts or an explicit unavailable observation.
 */
export async function observeGit(cwd: string): Promise<ParticipantObservation['git']> {
  let root = resolve(cwd)
  while (true) {
    const marker = join(root, '.git')
    let found = false
    try {
      const info = await lstat(marker)
      found = true
      let gitDirectory = marker
      const linkedWorktree = info.isFile()
      if (linkedWorktree) {
        const pointer = await readFile(marker, 'utf8')
        const path = /^gitdir: (.+)\s*$/u.exec(pointer)?.[1]
        if (path === undefined) return { kind: 'unavailable' }
        gitDirectory = resolve(root, path.trim())
      } else if (!info.isDirectory()) return { kind: 'unavailable' }
      const head = (await readFile(join(gitDirectory, 'HEAD'), 'utf8')).trim()
      const branch = head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : null
      if (branch === null && !/^(?:[a-f\d]{40}|[a-f\d]{64})$/u.test(head)) return { kind: 'unavailable' }
      return { kind: 'observed', root, branch, linkedWorktree }
    } catch (error) {
      if (found) return { kind: 'unavailable' }
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) return { kind: 'unavailable' }
    }
    const parent = dirname(root)
    if (parent === root) return { kind: 'unavailable' }
    root = parent
  }
}
