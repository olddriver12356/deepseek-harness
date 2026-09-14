import { readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export interface ProjectInspection {
  directory: string
  name: string
  scripts: Record<string, string>
  packageManagers: PackageManager[]
}

const lockfiles: Record<PackageManager, string[]> = {
  npm: ['package-lock.json', 'npm-shrinkwrap.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb'],
}

/** Inspect only the selected project, without running code or changing files. */
export async function inspectProject(directory: string): Promise<ProjectInspection> {
  const resolved = await realpath(directory)
  const raw: unknown = JSON.parse(await readFile(join(resolved, 'package.json'), 'utf8'))
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('package.json must contain an object')
  }
  const manifest = raw as Record<string, unknown>
  if (!manifest.scripts || typeof manifest.scripts !== 'object' || Array.isArray(manifest.scripts)) {
    throw new Error('package.json has no scripts')
  }
  const entries = Object.entries(manifest.scripts)
  if (!entries.length || entries.some(([, value]) => typeof value !== 'string' || !value.trim())) {
    throw new Error('Package scripts must be non-empty strings')
  }
  const packageManagers: PackageManager[] = []
  if (typeof manifest.packageManager === 'string') {
    const declared = manifest.packageManager.split('@')[0]
    if (!declared || !Object.hasOwn(lockfiles, declared)) throw new Error('Unsupported package manager')
    packageManagers.push(declared as PackageManager)
  }
  for (const [manager, files] of Object.entries(lockfiles)) {
    for (const file of files) {
      try {
        await stat(join(resolved, file))
        if (!packageManagers.includes(manager as PackageManager)) packageManagers.push(manager as PackageManager)
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
  return {
    directory: resolved,
    name: typeof manifest.name === 'string' ? manifest.name : resolved.split(/[\\/]/).at(-1) ?? resolved,
    scripts: Object.fromEntries(entries) as Record<string, string>,
    packageManagers: packageManagers.length ? packageManagers : ['npm'],
  }
}

/** Only local Web endpoints are valid launcher destinations. */
export function validateAppUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Application URL must be a local HTTP or HTTPS address without credentials')
  }
  return url.href
}
