/** Cordis Loader configuration file discovery. */

import { execFileSync } from 'node:child_process'
import { globSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * Read a repository config, including Git symlinks checked out as text on Windows.
 * Only index mode 120000 authorizes text-link resolution; ordinary YAML is unchanged.
 * @param root - Repository root that contains every resolved target.
 * @param file - Repository-relative configuration path.
 * @returns The target's YAML source without modifying the checkout.
 * @throws On a missing target, a cycle, or a path outside the repository.
 */
export function readCordisConfig(root: string, file: string): string {
  const boundary = realpathSync(root)
  const visited = new Set<string>()
  let path = resolve(root, file)
  for (;;) {
    const canonical = realpathSync(path)
    const inside = relative(boundary, canonical)
    if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
      throw new Error(`Cordis config link escapes repository: ${file}`)
    }
    if (visited.has(canonical)) throw new Error(`Cordis config link cycle: ${file}`)
    visited.add(canonical)
    const source = readFileSync(path, 'utf8')
    if (!/^\.{1,2}[\\/][^\r\n]+(?:\r?\n)?$/u.test(source)) return source
    const entry = execFileSync('git', ['ls-files', '--stage', '-z', '--', relative(root, path)], {
      cwd: root, encoding: 'utf8',
    })
    if (!entry.startsWith('120000 ')) return source
    path = resolve(dirname(path), source.replace(/\r?\n$/u, ''))
  }
}

/**
 * Return repository-relative Cordis Loader YAML paths under `root`.
 *
 * Translation consistency records are YAML sidecars, never Loader inputs.
 *
 * @param root Repository root to scan.
 * @returns Sorted repository-relative Loader configuration paths.
 */
export function cordisConfigFiles(root: string): string[] {
  return globSync(['**/*cordis*.yml', '**/*cordis*.yaml'], {
    cwd: root,
    exclude: ['.claude/**', 'node_modules/**', 'vendor/**', '**/*.i18n.yaml'],
  }).sort()
}
