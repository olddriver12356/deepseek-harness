import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { pathToFileURL } from 'node:url'
import * as progressPlugin from '../src/index.ts'
import * as fsPlugin from '@deepseek-ai/dsh-fs-local'
import { FsError } from '@deepseek-ai/dsh-fs'
import { inspectChecklist, planChecklistWrite } from '../src/vault.ts'
import { harness, milestones } from './consumer-harness.ts'
import { checkpointId } from '../src/domain.ts'
import type { VaultBinding } from '../src/types.ts'

const binding: VaultBinding = { targetKey: 'checklist-target', path: 'checklist.md', fingerprint: 'initial', mapping: [{ checkpointId: checkpointId('c1'), marker: 'stable-1' }],
  allowTextRefinement: false, writeback: 'confirmed', settlement: 'synchronized', message: '' }
const content = '# Project\r\n- [ ] Original title <!-- dsh:stable-1 -->\r\n  Manual notes stay.\r\n- [ ] Unrelated\r\n'
async function fixture() {
  const h = await harness()
  const dir = await mkdtemp(join(tmpdir(), 'dsh-progress-'))
  onTestFinished(() => rm(dir, { recursive: true, force: true }))
  await h.ctx.plugin(LocalFs, { cwd: dir })
  const path = join(dir, 'checklist.md')
  await writeFile(path, content)
  h.change({ kind: 'replace', milestones })
  h.ctx.on('user-questions/request', request => Promise.resolve({ answers: request.questions.map(q => ({ id: q.id, selected: ['Confirm'] })) }))
  return { ...h, path }
}

describe('stable checklist parsing and narrow writes', () => {
  it('preserves CRLF, manual notes and renamed text when only checkbox permission exists', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    const view = h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    const inspection = inspectChecklist(content, binding)
    expect(inspection.entries[0]).toMatchObject({ marker: 'stable-1', checked: false, text: 'Original title' })
    expect(planChecklistWrite(content, view, binding).text).toBe(content.replace('- [ ] Original', '- [x] Original'))
    const renamed = content.replace('Original title', 'Renamed without identity change')
    expect(planChecklistWrite(renamed, view, binding).text).toContain('Renamed without identity change')
    expect(() => inspectChecklist(content + '- [ ] Duplicate <!-- dsh:stable-1 -->\n', binding)).toThrow(/duplicate/)
    expect(() => inspectChecklist('# Deleted\n', binding)).toThrow(/missing/)
  })

  it('updates reordered mappings by source position, not mapping order', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    const state = h.ctx.longTermProgress.get(h.agent)
    if (state === null) throw new Error('missing progress')
    const text = '- [x] One <!-- dsh:a -->\n- [x] Two <!-- dsh:b -->\n'
    const plan = planChecklistWrite(text, state, { ...binding, mapping: [
      { checkpointId: checkpointId('c2'), marker: 'b' }, { checkpointId: checkpointId('c1'), marker: 'a' },
    ], allowTextRefinement: true })
    expect(plan.text).toBe('- [ ] Private checkpoint outcome — Private implementation <!-- dsh:a -->\n- [ ] Private shipping outcome <!-- dsh:b -->\n')
  })

  it('changes owned implementation text only with separately granted permission', async () => {
    const h = await harness()
    h.change({ kind: 'replace', milestones })
    const state = h.ctx.longTermProgress.get(h.agent)
    if (state === null) throw new Error('missing progress')
    const result = planChecklistWrite(content, state, { ...binding, allowTextRefinement: true }).text
    expect(result).toContain('Private checkpoint outcome — Private implementation <!-- dsh:stable-1 -->')
    expect(result).toContain('  Manual notes stay.\r\n- [ ] Unrelated\r\n')
  })
})

describe('checklist association and guarded synchronization', () => {
  it('composes the adapter through a real Loader YAML and synchronizes an owned temporary file', async () => {
    const h = await harness()
    await h.fiber.dispose()
    const dir = await mkdtemp(join(tmpdir(), 'dsh-progress-loader-'))
    onTestFinished(() => rm(dir, { recursive: true, force: true }))
    const path = join(dir, 'checklist.md')
    await writeFile(path, content)
    const config = join(dir, 'cordis.yml')
    await writeFile(config, `- name: progress-fixture\n- name: fs-fixture\n  config:\n    cwd: ${JSON.stringify(dir)}\n`)
    await h.ctx.plugin(Loader)
    h.ctx.loader.builtins.include = Include
    const internal = h.ctx.loader.internal
    if (internal === undefined) throw new Error('Loader internals unavailable')
    const importer = internal.import.bind(internal)
    internal.import = async (specifier: string, parent: string, attributes: ImportAttributes): Promise<unknown> => {
      if (specifier === 'progress-fixture') return progressPlugin
      if (specifier === 'fs-fixture') return fsPlugin
      const module: unknown = await importer(specifier, parent, attributes)
      return module
    }
    onTestFinished(async () => { internal.import = importer; await h.ctx.fiber.dispose() })
    await h.ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await h.ctx.loader.await()
    h.change({ kind: 'replace', milestones })
    h.ctx.on('user-questions/request', request => Promise.resolve({ answers: request.questions.map(q => ({ id: q.id, selected: ['Confirm'] })) }))
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(await readFile(path, 'utf8')).toContain('- [x] Original title')
  })

  it('requires exact existing association, syncs checkbox under standing permission and retries idempotently', async () => {
    const h = await fixture()
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(await readFile(h.path, 'utf8')).toBe(content)
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(await readFile(h.path, 'utf8')).toBe(content.replace('- [ ] Original', '- [x] Original'))
    const write = vi.spyOn(h.ctx.fs, 'writeText')
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(write).not.toHaveBeenCalled()
    expect(h.ctx.longTermProgress.get(h.agent)?.vault?.settlement).toBe('synchronized')
  })

  it('retains Session evidence and visible failure when the filesystem refuses a write', async () => {
    const h = await fixture()
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    vi.spyOn(h.ctx.fs, 'writeText').mockRejectedValueOnce(new FsError('Disk failed', 'FS_IO_ERROR'))
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(h.ctx.longTermProgress.get(h.agent)?.vault?.settlement).toBe('failed')
    expect(h.ctx.longTermProgress.get(h.agent)?.vault?.message).toContain('Disk failed')
    expect(h.ctx.longTermProgress.get(h.agent)?.milestones[0]?.checkpoints[0]?.complete).toBe(true)
    expect(await readFile(h.path, 'utf8')).toBe(content)
  })

  it('asks per changed checkpoint and can preserve an externally checked value with evidence', async () => {
    const h = await fixture()
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    await writeFile(h.path, content.replace('- [ ] Original', '- [x] Original'))
    h.ctx.on('user-questions/request', request => Promise.resolve({ answers: request.questions.map(q => ({
      id: q.id, selected: ['Keep checklist'],
    })) }), { prepend: true })
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(h.ctx.longTermProgress.get(h.agent)?.milestones[0]?.checkpoints[0]).toMatchObject({ complete: true })
    expect(h.ctx.longTermProgress.get(h.agent)?.vault?.settlement).toBe('synchronized')
  })

  it('marks linked progress pending immediately after evidence changes', async () => {
    const h = await fixture()
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    expect(h.ctx.longTermProgress.get(h.agent)?.vault?.settlement).toBe('pending')
  })

  it('does not write or settle a late conflict answer after disposal', async () => {
    const h = await fixture()
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    await writeFile(h.path, content + 'External edit\r\n')
    const entered = Promise.withResolvers<undefined>()
    const answer = Promise.withResolvers<import('@deepseek-ai/dsh-user-questions').AskUserQuestionAnswer>()
    h.ctx.on('user-questions/request', () => { entered.resolve(undefined); return answer.promise }, { prepend: true })
    const sync = h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    const settled = sync.catch(() => {})
    await entered.promise
    const seq = h.session.seq
    const dispose = h.fiber.dispose()
    answer.resolve({ answers: [{ id: 'stable-1', selected: ['Keep Session'] }] })
    await dispose
    await settled
    expect(h.session.seq).toBe(seq)
    expect(await readFile(h.path, 'utf8')).toBe(content + 'External edit\r\n')
  })

  it('uses the provider version fence when the file changes immediately before write publication', async () => {
    const h = await fixture()
    await h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)
    h.change({ kind: 'reconcile', checkpointId: checkpointId('c1'), evidence: { kind: 'passed', summary: 'Passed', references: ['run'] } })
    const write = h.ctx.fs.writeText.bind(h.ctx.fs)
    vi.spyOn(h.ctx.fs, 'writeText').mockImplementationOnce(async (...args) => {
      await writeFile(h.path, content + 'Concurrent writer\r\n')
      return write(...args)
    })
    await h.ctx.longTermProgress.syncChecklist(h.agent, new AbortController().signal)
    expect(h.ctx.longTermProgress.get(h.agent)?.vault?.settlement).toBe('conflict')
    expect(await readFile(h.path, 'utf8')).toContain('Concurrent writer')
    expect(await readFile(h.path, 'utf8')).toContain('- [ ] Original')
  })

  it('rejects a newer file edit made while association confirmation is open', async () => {
    const h = await fixture()
    h.ctx.on('user-questions/request', async (request) => {
      await writeFile(h.path, content + 'New external edit\r\n')
      return { answers: request.questions.map(q => ({ id: q.id, selected: ['Confirm'] })) }
    }, { prepend: true })
    await expect(h.ctx.longTermProgress.linkChecklist(h.agent, { revision: 1 }, {
      path: h.path, mapping: binding.mapping, allowTextRefinement: false,
    }, new AbortController().signal)).rejects.toThrow(/changed|stale/)
    expect(h.ctx.longTermProgress.get(h.agent)?.vault).toBeNull()
    expect(await readFile(h.path, 'utf8')).toContain('New external edit')
  })
})
