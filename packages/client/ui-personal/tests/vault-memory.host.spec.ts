import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { listMemory, readMemory } from '../src/vault-memory.ts'

it('reads the four tiers and Flags without traversing linked directories or arbitrary vault paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-memory-'))
  try {
    expect(await listMemory(root)).toEqual([])
    for (const dir of ['Memory/Episodic/2026-W38', 'Memory/Semantic', 'Memory/Handoff', 'outside']) await mkdir(join(root, dir), { recursive: true })
    for (const file of ['Working Memory.md', 'Flags.md', 'Episodic/2026-W38/2026-09-20.md', 'Semantic/Profile.md', 'Handoff/next.md', 'AGENTS.md']) await writeFile(join(root, 'Memory', file), '# Safe content\n')
    await writeFile(join(root, 'outside/private.md'), 'secret')
    await symlink(join(root, 'outside'), join(root, 'Memory/Semantic/linked'), process.platform === 'win32' ? 'junction' : 'dir')
    const files = await listMemory(root)
    expect(files.map(file => file.tier).sort()).toEqual(['episodic', 'flags', 'handoff', 'semantic', 'working'])
    expect(await readMemory(root, 'Semantic/Profile.md')).toMatchObject({ content: '# Safe content\n' })
    for (const path of ['../outside/private.md', 'Semantic/linked/private.md', 'Semantic/../../outside/private.md', 'AGENTS.md', 'C:/private.md', 'Semantic\\Profile.md']) await expect(readMemory(root, path)).rejects.toThrow()
    await writeFile(join(root, 'Memory/Semantic/large.md'), 'x'.repeat(1_048_577))
    await expect(readMemory(root, 'Semantic/large.md')).rejects.toThrow('too large')
  } finally { await rm(root, { recursive: true, force: true }) }
})
