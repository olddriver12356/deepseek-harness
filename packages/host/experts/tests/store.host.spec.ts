import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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

  it('rejects an artifact whose title does not match its package directory', async () => {
    const store = new ExpertStore(await vaultWith('Mismatch'))
    const path = join(roots[0]!, 'Agents', '5 Methods', 'Experts', 'Mismatch', 'ARTIFACT.md')
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(path, 'utf8')
    await writeFile(path, text.replace('title: "Mismatch"', 'title: "Other"'))
    await expect(store.list()).rejects.toThrow('title does not match package directory')
  })
})
