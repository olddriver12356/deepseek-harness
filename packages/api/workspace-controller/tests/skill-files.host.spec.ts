import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SkillFileStore } from '../src/skill-files.ts'
import type { SkillFileRequest, WorkspaceId } from '../src/types.ts'

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-skill-editor-'))
  directories.push(root)
  const project = join(root, 'project'), personal = join(root, 'personal')
  await mkdir(join(project, 'capture/references'), { recursive: true })
  await mkdir(personal)
  const source = '---\nname: capture\ndescription: Capture a source\nmetadata:\n  category: writing\n---\nInstructions\n'
  await writeFile(join(project, 'capture/SKILL.md'), source)
  await writeFile(join(project, 'capture/references/example.txt'), 'original')
  await writeFile(join(project, 'broken.md'), '---\nname: [\n---\nrepair me')
  await writeFile(join(personal, 'capture.md'), source)
  const store = new SkillFileStore(async () => [{ path: project, source: 'project-agents', rank: 200 }, { path: personal, source: 'user-agents', rank: 500 }])
  const inventory = await store.inventory(root)
  const item = inventory.skills.find(skill => skill.name === 'capture' && !skill.shadowed)!
  const request: SkillFileRequest = { workspaceId: 'workspace' as WorkspaceId, id: item.id, file: 'references/example.txt' }
  return { store, root, project, personal, inventory, item, request }
}
describe('physical skill editing', () => {
  it('keeps invalid and shadowed files visible and groups by file metadata', async () => {
    const { inventory, project, personal } = await fixture()
    expect(inventory.skills).toHaveLength(3)
    expect(inventory.skills.find(skill => skill.name === 'broken')?.problem).not.toBe('')
    expect(inventory.skills.filter(skill => skill.name === 'capture').map(skill => [skill.category, skill.shadowed])).toEqual([['writing', false], ['writing', true]])
    expect(inventory).toMatchObject({ projectDestination: project, personalDestination: personal })
  })
  it('uses runtime boolean spellings and rejects invalid invocation names', async () => {
    const { store, root, project } = await fixture()
    await writeFile(join(project, 'legacy.md'), '---\nname: legacy\ndescription: Compatible flags\nuser-invocable: no\ndisable-model-invocation: 1\n---\nbody')
    await writeFile(join(project, 'invalid.md'), '---\nname: Invalid Name\ndescription: Invalid name\n---\nbody')
    const inventory = await store.inventory(root)
    expect(inventory.skills.find(item => item.name === 'legacy')).toMatchObject({ userInvocable: false, modelInvocable: false, problem: '' })
    expect(inventory.skills.find(item => item.path === join(project, 'invalid.md'))?.problem).not.toBe('')
  })
  it('reads and saves nested files, refuses stale saves and creates exclusively', async () => {
    const { store, root, project, request } = await fixture()
    const original = await store.read(root, request)
    expect(original.content).toBe('original')
    await store.write(root, { ...request, revision: original.revision, content: 'saved' })
    await expect(store.write(root, { ...request, revision: original.revision, content: 'stale' })).rejects.toThrow('changed externally')
    expect(await readFile(join(project, 'capture/references/example.txt'), 'utf8')).toBe('saved')
    await store.write(root, { ...request, file: 'examples/new.txt', revision: null, content: 'new' })
    await expect(store.write(root, { ...request, file: 'examples/new.txt', revision: null, content: 'overwrite' })).rejects.toThrow()
    expect(await store.tree(root, request.id)).toContainEqual({ path: 'examples/new.txt', kind: 'file' })
  })
  it('rejects traversal, unknown identities and nested junction escapes', async () => {
    const { store, root, project, personal, request } = await fixture()
    for (const file of ['../capture.md', '/etc/passwd', 'x:stream', 'foo/../../outside']) await expect(store.read(root, { ...request, file })).rejects.toThrow()
    await expect(store.read(root, { ...request, id: 'missing' as typeof request.id })).rejects.toThrow('no longer exists')
    await symlink(personal, join(project, 'capture/escape'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(store.read(root, { ...request, file: 'escape/capture.md' })).rejects.toThrow('escapes')
    await expect(store.write(root, { ...request, file: 'escape/new.md', revision: null, content: 'bad' })).rejects.toThrow('escapes')
    expect(await store.tree(root, request.id)).toContainEqual({ path: 'escape', kind: 'blocked' })
  })
  it('deduplicates root junctions and keeps binary and flat siblings protected', async () => {
    const { store, root, project, personal, request } = await fixture()
    await symlink(join(project, 'capture'), join(personal, 'alias'), process.platform === 'win32' ? 'junction' : 'dir')
    expect((await store.inventory(root)).skills).toHaveLength(3)
    await writeFile(join(project, 'capture/image.bin'), Buffer.from([0, 1, 2]))
    expect((await store.read(root, { ...request, file: 'image.bin' })).content).toBeNull()
    const flat = (await store.inventory(root)).skills.find(skill => skill.name === 'broken')!
    await expect(store.read(root, { ...request, id: flat.id, file: 'capture/SKILL.md' })).rejects.toThrow('only its own file')
    await writeFile(join(project, 'SKILL.md'), '---\nname: root-file\ndescription: flat\n---\nbody')
    const rootFile = (await store.inventory(root)).skills.find(skill => skill.name === 'root-file')!
    expect(rootFile.bundle).toBe(false)
    await expect(store.read(root, { ...request, id: rootFile.id, file: 'capture/SKILL.md' })).rejects.toThrow('only its own file')
  })
})
