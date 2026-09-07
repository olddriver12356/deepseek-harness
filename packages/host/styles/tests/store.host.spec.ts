import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { StyleStore } from '../src/store.ts'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

async function vaultWith(title: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-styles-'))
  roots.push(root)
  await mkdir(join(root, 'Agents', '5 Methods', 'Styles', title), { recursive: true })
  await writeFile(join(root, 'Agents', 'Artifact Schema v1.md'), '# schema\n')
  await writeFile(join(root, 'Agents', '5 Methods', 'Styles', title, 'ARTIFACT.md'), `---
id: "style-test"
title: "${title}"
artifact_type: "Method"
method_kind: "Style"
expert_status: "approved"
description: "Concise, clear, and direct."
updated: "2026-09-06"
---

## Instructions

Keep sentences short. Lead with the answer.
`)
  return root
}

describe('StyleStore', () => {
  it('reads an approved Style Method from the confined Vault directory', async () => {
    const store = new StyleStore(await vaultWith('Concise Voice'))
    await expect(store.list()).resolves.toEqual([expect.objectContaining({
      id: 'style-test', name: 'Concise Voice', status: 'approved', instructions: 'Keep sentences short. Lead with the answer.',
    })])
  })

  it('rejects an artifact whose title does not match its package directory', async () => {
    const store = new StyleStore(await vaultWith('Mismatch'))
    const path = join(roots[0]!, 'Agents', '5 Methods', 'Styles', 'Mismatch', 'ARTIFACT.md')
    const { readFile } = await import('node:fs/promises')
    const text = await readFile(path, 'utf8')
    await writeFile(path, text.replace('title: "Mismatch"', 'title: "Other"'))
    await expect(store.list()).rejects.toThrow('title does not match package directory')
  })

  it('rejects a configured path that is not an Agent Layer Vault, not a raw fs error', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-styles-'))
    roots.push(root)
    const store = new StyleStore(join(root, 'no-such-vault'))
    await expect(store.list()).rejects.toThrow('configured path is not an Agent Layer Vault')
  })
})
