import { afterEach, describe, expect, it } from 'vitest'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import * as collaboration from '../src/index.ts'
import { createCollaborationHarness, type CollaborationHarness } from './helpers/harness.ts'

const open: CollaborationHarness[] = []
afterEach(async () => {
  while (open.length > 0) await open.pop()!.dispose()
})

describe('collaboration through the real Loader export path', () => {
  it('exposes the metadata the Loader reads', () => {
    expect('default' in collaboration).toBe(false)
    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(collaboration) as Record<string, unknown>
    expect(unwrapped['name']).toBe('collaboration')
    expect(unwrapped['inject']).toEqual(['tools'])
    expect(unwrapped['Config']).toBeDefined()
    expect(typeof unwrapped['apply']).toBe('function')
  })

  it('defaults peer discussion to read-only file tools', () => {
    expect(collaboration.Config({})).toEqual({ peerDiscussionTools: ['read', 'glob', 'grep'] })
  })

  it('rejects a malformed allowlist when the plugin loads instead of ignoring it', () => {
    expect(() => collaboration.Config({ peerDiscussionTools: 'read' })).toThrow()
    expect(() => collaboration.Config({ peerDiscussionTools: [1] })).toThrow()
  })

  it.each(['write', 'bash', 'run_code', 'cordis_run', 'delegate', 'publish', 'unknown_tool'])('rejects %s as a peer-discussion capability', (name) => {
    expect(() => collaboration.Config({ peerDiscussionTools: [name] })).toThrow()
  })

  it('applies the configured read allowlist to a booted runtime', async () => {
    const h = await createCollaborationHarness({ peerDiscussionTools: ['read'] })
    open.push(h)
    await h.deliverPeerDiscussion('go')
    expect((await h.executeCurrentTool('read', {})).accepted).toBe(true)
    expect((await h.executeCurrentTool('write', { file_path: 'allowed.txt' })).accepted).toBe(false)
    expect((await h.executeCurrentTool('bash', {})).accepted).toBe(false)
  })

  it('denies every tool that is not on an empty allowlist', async () => {
    const h = await createCollaborationHarness({ peerDiscussionTools: [] })
    open.push(h)
    await h.deliverPeerDiscussion('go')
    expect((await h.executeCurrentTool('read', {})).accepted).toBe(false)
  })
})
