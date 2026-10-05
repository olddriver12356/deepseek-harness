/** Current-writer publication for declared Web owners whose refresh path only seeds or renders historical input. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdCompressSync, zstdDecompressSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import { materializeSessionSnapshotFixtureForPersistence } from '@deepseek-ai/dsh-llm-replay'
import {
  assertSessionFixtureVersion, normalizeSessionSnapshot, normalizeSessionSnapshots, redactSessionSnapshotIds,
} from '@deepseek-ai/dsh-session-snapshot'
import { generationLogPath } from '../../../packages/session/session-persistence-jsonl/src/format.ts'
import { scanZstdFrames } from '../../../packages/session/session-persistence-jsonl/src/zstd.ts'
import { launchWebScaffold, realizeSeedFixture, recordedSessionFixturePath, webSnapshotMode } from './scaffold.ts'

const ROOT = fileURLToPath(new URL('../../../snapshots/web/', import.meta.url))
const OWNERS = [
  'seeded-history', 'schedule-catalog', 'pwsh-terminal', 'ptc-escalation-approved',
  'present', 'plan-narrow-viewport', 'navigation-panes', 'message-feedback-protocol',
  'feedback-command', 'diff-bounded', 'deepseek-messages-chat', 'auto-review-denial',
] as const

const PUBLICATION_OWNERS = [
  ...OWNERS.map(owner => ({ owner, predecessor: join(ROOT, owner, 'session.v3.jsonl') })),
  // This rejection owner intentionally creates no protocol Session.
  // Its authored empty history still migrates through the real storage writer.
  { owner: 'acp-reject-extra-dirs', predecessor: join(ROOT, '../acp/reject-extra-dirs/session.v3.jsonl') },
  // Retain the released V3 source as a separate migration owner.
  // Its current successor is verified in the real persistence root without replacing the selected historical source.
  { owner: 'adjacent-format-migration', predecessor: join(ROOT, 'adjacent-format-migration/session.v3.jsonl') },
]

describe.skipIf(webSnapshotMode() === 'record')('Web cold fixture current-writer publication', () => {
  it.each(PUBLICATION_OWNERS)('migrates $owner through read and write handles without replacing its predecessor', async ({ owner, predecessor }) => {
    const original = await readFile(predecessor, 'utf8')
    const scaffold = await launchWebScaffold()
    try {
      const id = SessionId(`web-fixture-owner-${owner}`)
      const source = materializeSessionSnapshotFixtureForPersistence(realizeSeedFixture(scaffold, original, id))
      const sourceHeader = JSON.parse(source.split('\n')[0]!) as { version: number; cwd?: string }
      const sourcePath = generationLogPath(scaffold.persistenceRoot, sourceHeader.cwd, id, sourceHeader.version, 'zstd')
      const currentPath = generationLogPath(scaffold.persistenceRoot, sourceHeader.cwd, id, SESSION_FORMAT_VERSION, 'zstd')
      await mkdir(dirname(sourcePath), { recursive: true })
      const sourceBytes = Buffer.concat(source.trimEnd().split('\n').map(line => zstdCompressSync(Buffer.from(line + '\n'))))
      await writeFile(sourcePath, sourceBytes)
      const reader = await scaffold.ctx.sessionPersistence.open(id, 'read')
      try {
        expect(reader.header.version).toBe(SESSION_FORMAT_VERSION)
        await reader.read()
      } finally { await reader.close() }
      await expect(readFile(currentPath)).rejects.toMatchObject({ code: 'ENOENT' })
      const writer = await scaffold.ctx.sessionPersistence.open(id, 'write')
      try { await writer.read() } finally { await writer.close() }
      const bytes = await readFile(currentPath)
      const emitted = Buffer.concat(scanZstdFrames(bytes).frames
        .map(({ start, end }) => zstdDecompressSync(bytes.subarray(start, end)))).toString('utf8')
      const context = { sessionIds: [String(id)], cwd: scaffold.workspaceCwd }
      expect(normalizeSessionSnapshots([emitted], context)).toEqual(normalizeSessionSnapshots([source], context))
      expect(await readFile(sourcePath)).toEqual(sourceBytes)
      expect(await readFile(predecessor, 'utf8')).toBe(original)
      const projection = redactSessionSnapshotIds([normalizeSessionSnapshot(emitted, context)])[0]!
      const successor = recordedSessionFixturePath(predecessor, writer.header.version)
      expect(assertSessionFixtureVersion(successor.split(/[/\\]/u).at(-1)!, projection)).toBe(SESSION_FORMAT_VERSION)
      if (owner === 'adjacent-format-migration') return
      if (webSnapshotMode() === 'refresh') await writeFile(successor, projection)
      expect(await readFile(successor, 'utf8')).toBe(projection)
    } finally { await scaffold.close() }
  })
})
