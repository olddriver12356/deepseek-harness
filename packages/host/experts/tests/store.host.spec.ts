import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ExpertStore } from '../src/store.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function vaultWith(title: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-experts-'))
  roots.push(root)
  await mkdir(join(root, 'Agents', '5 Methods', 'Experts', title), { recursive: true })
  await writeFile(join(root, 'Agents', 'Artifact Schema v1.md'), '# schema\n')
  await writeFile(join(root, 'Agents', '5 Methods', 'Experts', title, 'ARTIFACT.md'), `---
id: "agent-test"
title: "${title}"
artifact_type: "Method"
method_kind: "Expert"
expert_status: "approved"
category: "Engineering"
description: "Trace the real call path."
model: "inherit"
reasoning: "high"
permission: "inherit"
skills: ["systematic-debugging"]
updated: "2026-09-06"
---

## Instructions

Reproduce before changing code.
`)
  return root
}

describe('ExpertStore', () => {
  it('reads an approved Expert Method from the confined Vault directory', async () => {
    const store = new ExpertStore(await vaultWith('Plugin Compatibility Expert'))
    await expect(store.list()).resolves.toEqual([expect.objectContaining({
      id: 'agent-test', name: 'Plugin Compatibility Expert', status: 'approved', instructions: 'Reproduce before changing code.',
    })])
  })

  it('no longer surfaces the retired permission and skills fields', async () => {
    const store = new ExpertStore(await vaultWith('Retired Fields Expert'))
    const [record] = await store.list()
    expect(record).not.toHaveProperty('permission')
    expect(record).not.toHaveProperty('skills')
  })

  it('leaves a legacy artifact\'s retired keys on disk untouched when it is rewritten', async () => {
    const root = await mutableVault('Legacy Keys Expert')
    const store = new ExpertStore(root)
    const [before] = await store.list()
    await store.update(before!.id, { ...before!, description: 'Edited.' })
    const text = await readFile(join(root, 'Agents', '5 Methods', 'Experts', 'Legacy Keys Expert', 'ARTIFACT.md'), 'utf8')
    expect(text).not.toContain('permission:')
    expect(text).not.toContain('skills:')
  })

  it('rejects an artifact whose title does not match its package directory', async () => {
    const store = new ExpertStore(await vaultWith('Mismatch'))
    const path = join(roots[0]!, 'Agents', '5 Methods', 'Experts', 'Mismatch', 'ARTIFACT.md')
    const text = await readFile(path, 'utf8')
    await writeFile(path, text.replace('title: "Mismatch"', 'title: "Other"'))
    await expect(store.list()).rejects.toThrow('title does not match package directory')
  })

  it('rejects a configured path that is not an Agent Layer Vault, not a raw fs error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-experts-'))
    roots.push(root)
    const store = new ExpertStore(join(root, 'no-such-vault'))
    await expect(store.list()).rejects.toThrow('configured path is not an Agent Layer Vault')
  })

  it('defaults execution to conversational when the artifact has no such key', async () => {
    const store = new ExpertStore(await vaultWith('Legacy Expert'))
    const [record] = await store.list()
    expect(record?.execution).toBe('conversational')
  })

  it('reads a declared delegated execution mode', async () => {
    const root = await vaultWith('Delegated Expert')
    const path = join(root, 'Agents', '5 Methods', 'Experts', 'Delegated Expert', 'ARTIFACT.md')
    const text = await readFile(path, 'utf8')
    await writeFile(path, text.replace('method_kind: "Expert"', 'method_kind: "Expert"\nexecution: "delegated"'))
    const [record] = await new ExpertStore(root).list()
    expect(record?.execution).toBe('delegated')
  })

  it('falls back to conversational for an unrecognized execution value', async () => {
    const root = await vaultWith('Broken Expert')
    const path = join(root, 'Agents', '5 Methods', 'Experts', 'Broken Expert', 'ARTIFACT.md')
    const text = await readFile(path, 'utf8')
    await writeFile(path, text.replace('method_kind: "Expert"', 'method_kind: "Expert"\nexecution: "nonsense"'))
    const [record] = await new ExpertStore(root).list()
    expect(record?.execution).toBe('conversational')
  })
})

/** Mutations run the Vault sync guard and the Agent Layer rebuild, so a mutable fixture needs both scripts. */
async function mutableVault(title: string): Promise<string> {
  const root = await vaultWith(title)
  await mkdir(join(root, 'Workspace', 'Projects', 'Central Hub', 'Sync'), { recursive: true })
  await mkdir(join(root, 'Agents', 'Tools'), { recursive: true })
  await writeFile(join(root, 'Workspace', 'Projects', 'Central Hub', 'Sync', 'Invoke-VaultSyncGuard.ps1'), 'exit 0\n')
  await writeFile(join(root, 'Agents', 'Tools', 'AgentLayer.ps1'), 'exit 0\n')
  return root
}

describe('execution mode survives a round trip', () => {
  it('preserves delegated across an unrelated description edit', async () => {
    const root = await mutableVault('Root Cause Expert')
    const store = new ExpertStore(root)
    const [before] = await store.list()
    const updated = await store.update(before!.id, { ...before!, execution: 'delegated' })
    expect(updated.execution).toBe('delegated')

    const edited = await store.update(updated.id, { ...updated, description: 'Changed description.' })
    expect(edited.execution).toBe('delegated')
    expect(edited.description).toBe('Changed description.')

    const [reloaded] = await new ExpertStore(root).list()
    expect(reloaded?.execution).toBe('delegated')
  })

  it('rejects an execution value outside the union', async () => {
    const root = await mutableVault('Guarded Expert')
    const store = new ExpertStore(root)
    const [before] = await store.list()
    await expect(store.update(before!.id, { ...before!, execution: 'sideways' as never }))
      .rejects.toThrow('experts: invalid execution mode')
  })
})
