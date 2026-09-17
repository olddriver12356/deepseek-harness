import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const directories: string[] = []

export interface TempArchive {
  readonly archivePath: string
  readonly cacheDir: string
  readonly vaultRoot: string
}

export async function createTempArchive(): Promise<TempArchive> {
  const vaultRoot = await mkdtemp(join(tmpdir(), 'dsh-news-archive-'))
  directories.push(vaultRoot)
  return {
    archivePath: join(vaultRoot, 'Agents', '.generated', 'news', 'news.jsonl'),
    cacheDir: join(vaultRoot, 'cache'),
    vaultRoot,
  }
}

export async function removeTempArchives(): Promise<void> {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
}
