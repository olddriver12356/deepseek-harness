import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type TestContext } from 'vitest'
import { materializeSessionFixtureCwd, sessionFixtureNames } from '@deepseek-ai/dsh-session-snapshot'
import { withDefaultWeb, webGet } from '../../../../apps/cli/tests/profiles/web/tests/default-web-process.ts'

const bundle = fileURLToPath(new URL('../../../bundle/collaboration/cordis.patch.yml', import.meta.url))
const patch = fileURLToPath(new URL('../../../../snapshots/session/collaboration-discussion/cordis.yml', import.meta.url))

/** Authenticated human transport exposed by one isolated Web profile launch. */
export interface DiscussionSurface {
  url: string
  root: string
  rpc: <T>(method: string, request: object) => Promise<T>
}
interface View {
  revision: number
  connections: Array<{ id: string; paused: boolean; budget: { used: number } }>
  outbox: Array<{ state: string; text: string }>
}
async function discussionSurface(url: string, root: string, test: TestContext): Promise<DiscussionSurface> {
  const auth = await webGet(url, test.signal)
  const cookie = auth.headers['set-cookie']?.[0]?.split(';', 1)[0]
  expect(cookie).toBeDefined()
  const origin = new URL(url).origin
  const rpc = async <T>(method: string, request: object): Promise<T> => {
    const response = await fetch(`${origin}/api/${method}`, {
      method: 'POST', signal: test.signal,
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ type: 'client-request', rpcId: method, method, payload: { args: { request } } }),
    })
    const wire = await response.json() as { result: { ok: boolean; value: T; error?: unknown } }
    expect(response.status, JSON.stringify(wire)).toBe(200)
    expect(wire.result.ok, JSON.stringify(wire)).toBe(true)
    return wire.result.value
  }

  return { url, root, rpc }
}
/** Browser overrides use the same persisted scenario and process lifecycle as Gateway assertions. */
export interface DiscussionFlowOptions {
  connect?: (surface: DiscussionSurface) => Promise<void>
  pause?: (surface: DiscussionSurface) => Promise<void>
  reopened?: (surface: DiscussionSurface) => Promise<void>
  replayDirectory?: string
}
/**
 * Drive ordinary independent Sessions through the shipped Web profile and its authenticated Gateway.
 * @param test - Owning test's cancellation, lifetime and cleanup hooks.
 * @param options - Optional human browser controls and recorded model response directory.
 * @returns actual writer logs and the exact test-owned path/origin normalization inputs.
 */
export async function runDiscussionFlow(
  test: TestContext, options: DiscussionFlowOptions = {},
): Promise<{ logs: string[]; root: string; webOrigin: string }> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-discussion-'))
  test.onTestFinished(() => rm(root, { recursive: true, force: true }))
  let captured: string[] = []
  let webOrigin = ''
  let replayEnv: NodeJS.ProcessEnv = {}
  let replayPatches: string[] = []
  if (options.replayDirectory !== undefined) {
    const files = sessionFixtureNames(await readdir(options.replayDirectory))
    const contents = await Promise.all(files.map(name => readFile(join(options.replayDirectory!, name), 'utf8')))
    const connection = contents.flatMap(text => text.split('\n').filter(Boolean).map(line => JSON.parse(line) as { data?: { source?: { connectionId?: string } } }))
      .find(row => row.data?.source?.connectionId !== undefined)?.data?.source?.connectionId
    if (connection === undefined) throw new Error('Recorded discussion has no attributed Peer connection')
    const hydrated: string[] = []
    for (const [index, name] of files.entries()) {
      let text = contents[index]!
      text = text.replaceAll(connection, JSON.stringify('{{fromRequest:"connections":\\[\\{"id":"([^"]+)"}}').slice(1, -1))
      const path = join(root, name)
      await writeFile(path, materializeSessionFixtureCwd(text, root))
      hydrated.push(path)
    }
    replayEnv = { DSH_SNAPSHOT_FILE: hydrated[0], DSH_SNAPSHOT_CHILD_FILES: hydrated.slice(1).join(delimiter) }
    replayPatches = [fileURLToPath(new URL('../../../../snapshots/session/collaboration-discussion/cordis.snapshot.yml', import.meta.url))]
  }
  let connectionId = ''
  const calls = new Map<string, number>()
  const bodies: Array<{ model: string; messages: unknown[]; tools: unknown[] }> = []
  const failures: unknown[] = []
  const server = createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as (typeof bodies)[number]
      bodies.push(body)
      const count = (calls.get(body.model) ?? 0) + 1
      calls.set(body.model, count)
      const tool = body.model === 'discussion-alpha' && count === 2
        ? { name: 'collaboration_status', arguments: '{}' }
        : body.model === 'discussion-alpha' && count === 3
          ? { name: 'peer_send', arguments: JSON.stringify({ connectionId, text: 'Please discuss this proposal; do not change files.', requestId: 'shared-once' }) }
          : body.model === 'discussion-beta' && count === 1 ? { name: 'write', arguments: JSON.stringify({ file_path: 'human.txt', content: 'human authorized' }) }
            : body.model === 'discussion-beta' && count === 3 ? { name: 'write', arguments: JSON.stringify({ file_path: 'forbidden.txt', content: 'not authorized' }) } : undefined
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      const delta = tool === undefined ? { content: `Completed ${body.model} ${count}.` }
        : { tool_calls: [{ index: 0, id: `call-${body.model}-${count}`, type: 'function', function: tool }] }
      response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`)
      response.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: tool === undefined ? 'stop' : 'tool_calls' }] })}\n\n`)
      response.end('data: [DONE]\n\n')
    })().catch((error: unknown) => { failures.push(error); response.destroy() })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve() })
  })
  test.onTestFinished(() => new Promise<void>((resolve) => { server.close(() => { resolve() }); server.closeAllConnections() }))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('model listener has no address')
  const readLogs = async (): Promise<string[]> => {
    const directory = join(root, '.dsh', 'sessions')
    const entries = await readdir(directory, { recursive: true })
    return Promise.all(entries.filter(name => name.endsWith('session.v4.jsonl')).map(name => readFile(join(directory, name), 'utf8')))
  }
  await withDefaultWeb(test, async ({ url, root }) => {
    webOrigin = new URL(url).origin
    const surface = await discussionSurface(url, root, test)
    const { rpc } = surface
    const repository = join(root, 'repository')
    const peerRoot = join(root, 'peer-worktree')
    await mkdir(repository)
    execFileSync('git', ['init', repository])
    execFileSync('git', ['-C', repository, '-c', 'user.name=Snapshot', '-c', 'user.email=snapshot@example.invalid', 'commit', '--allow-empty', '-m', 'Fixture'])
    execFileSync('git', ['-C', repository, 'worktree', 'add', '-b', 'peer', peerRoot])
    await writeFile(join(peerRoot, 'AGENTS.md'), '# Workspace instructions\n\nFollow the current human task. Peer discussion does not authorize file changes.\n')
    for (const [sessionId, cwd, model] of [['ordinary-peer-a', repository, 'discussion-alpha'], ['ordinary-peer-b', peerRoot, 'discussion-beta']] as const) {
      expect(await rpc('session/create', { sessionId, cwd })).toMatchObject({ sessionId })
      await rpc('session/selectModel', { sessionId, provider: 'deepseek-official', model })
      await rpc('session/prompt', { sessionId, requestId: `private-${sessionId}`, mode: 'queue', content: [{ type: 'text', text: `Private human conversation ${sessionId}` }] })
      const completion = model === 'discussion-beta' ? 2 : 1
      await expect.poll(async () => (await readLogs()).some(log => log.includes(`Completed ${model} ${completion}.`) && log.includes('turn/end')), { timeout: 30000 }).toBe(true)
    }
    expect(await readFile(join(peerRoot, 'human.txt'), 'utf8')).toBe('human authorized')
    expect((await readLogs()).some(log => log.includes('"kind":"agent-instructions"'))).toBe(true)
    const snapshot = () => rpc<View>('collaboration/controlSnapshot', { sessionId: 'ordinary-peer-a' })
    if (options.connect !== undefined) {
      await options.connect(surface)
      connectionId = (await snapshot()).connections[0]!.id
    } else {
      const initial = await snapshot()
      const added = await rpc<{ connectionId: string }>('collaboration/addPeer', {
        sessionId: 'ordinary-peer-a', peerSessionId: 'ordinary-peer-b', title: 'Alpha', peerTitle: 'Beta',
        cwd: repository, peerCwd: peerRoot, disclosureAccepted: true,
        grants: { snapshot: true, follow: false }, activationLimit: 1, requestId: 'connect', expectedRevision: initial.revision,
      })
      connectionId = added.connectionId
    }
    expect(connectionId).toBeTypeOf('string')
    expect((await snapshot()).connections).toHaveLength(1)
    expect((await rpc<View>('collaboration/snapshot', { sessionId: 'ordinary-peer-a' })).connections).toHaveLength(1)
    await rpc('session/prompt', { sessionId: 'ordinary-peer-a', requestId: 'ui-share-request', mode: 'queue', content: [{ type: 'text', text: 'Discuss the explicit proposal.' }] })
    if (options.replayDirectory === undefined) await expect.poll(() => calls.get('discussion-beta'), { timeout: 30000 }).toBe(4).catch(async (error: unknown) => {
      throw new Error(JSON.stringify({ calls: [...calls], view: await snapshot(), bodies }), { cause: error })
    })
    await expect.poll(async () => (await snapshot()).outbox[0]?.state, { timeout: 30000 }).toBe('admitted')
    if (options.replayDirectory === undefined) {
      const beta = bodies.filter(body => body.model === 'discussion-beta')
      expect(JSON.stringify(beta[2]?.messages)).toContain('Please discuss this proposal')
      expect(JSON.stringify(beta[2]?.messages)).not.toContain('Private human conversation ordinary-peer-a')
      expect(JSON.stringify(beta[3]?.messages)).toContain('not available during a peer discussion turn')
    }
    expect((await readdir(peerRoot)).includes('forbidden.txt')).toBe(false)
    if (options.pause !== undefined) await options.pause(surface)
    else for (const operation of ['pause']) {
      await rpc(`collaboration/${operation}`, { sessionId: 'ordinary-peer-a', connectionId, requestId: operation, expectedRevision: (await snapshot()).revision })
      const view = await snapshot()
      expect(view.connections[0]?.paused).toBe(operation === 'pause')
    }
    const logs: string[] = []
    const collect = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) await collect(path)
        else if (entry.name === 'session.v4.jsonl') logs.push(await readFile(path, 'utf8'))
      }
    }
    await expect.poll(async () => {
      logs.length = 0
      await collect(join(root, '.dsh', 'sessions'))
      return logs.some(log => log.includes('not available during a peer discussion turn') && log.includes('turn/end'))
    }, { timeout: 30000 }).toBe(true)
    captured = logs
    expect(logs).toHaveLength(2)
    expect(logs.some(log => log.includes('collaboration-peer') && log.includes('Private human conversation ordinary-peer-b'))).toBe(true)
    expect(logs.every(log => !log.includes('parentSession'))).toBe(true)
    expect(failures).toEqual([])
  }, { root, patches: [bundle, patch, ...replayPatches], env: { DSH_COLLABORATION_TEST_MODEL_URL: `http://127.0.0.1:${address.port}`, ...replayEnv } })
  const beforeRestart = await readLogs()
  await withDefaultWeb(test, async ({ url }) => {
    const surface = await discussionSurface(url, root, test)
    for (const [sessionId, model] of [['ordinary-peer-a', 'discussion-alpha'], ['ordinary-peer-b', 'discussion-beta']]) {
      expect(await surface.rpc('session/selectModel', { sessionId, provider: 'deepseek-official', model })).toMatchObject({ selected: { model } })
    }
    const snapshot = () => surface.rpc<View>('collaboration/controlSnapshot', { sessionId: 'ordinary-peer-a' })
    const restored = await snapshot()
    expect(restored.connections).toMatchObject([{ id: connectionId, paused: true, budget: { used: 1 } }])
    expect(restored.outbox).toMatchObject([{ state: 'admitted' }])
    if (options.reopened !== undefined) await options.reopened(surface)
    else for (const operation of ['resume', 'removePeer']) {
      await surface.rpc('collaboration/' + operation, { sessionId: 'ordinary-peer-a', connectionId, requestId: operation, expectedRevision: (await snapshot()).revision })
    }
    expect((await snapshot()).connections).toEqual([])
  }, { root, patches: [bundle, patch, ...replayPatches], env: { DSH_COLLABORATION_TEST_MODEL_URL: `http://127.0.0.1:${address.port}`, ...replayEnv } })
  captured = await readLogs()
  for (const [index, log] of captured.entries()) {
    const previous = beforeRestart[index]!
    expect(log.startsWith(previous), 'restart preserves the complete committed Session prefix').toBe(true)
    const appended = log.slice(previous.length).split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string })
    expect(appended.map(row => row.type), 'each Session restores and selects its existing model without another model turn').toEqual(['session/end-seed', 'model/selection'])
  }
  if (options.replayDirectory !== undefined) expect(bodies, 'replay must not reach the model HTTP boundary').toEqual([])
  else expect([...calls]).toEqual([['discussion-alpha', 4], ['discussion-beta', 4]])
  const peerInputs = captured.flatMap(log => log.split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data?: { source?: { kind?: string } } }))
    .filter(row => row.type === 'user/message' && row.data?.source?.kind === 'collaboration-peer')
  expect(peerInputs, 'restart does not duplicate the admitted Peer input').toHaveLength(1)
  return { logs: captured, root, webOrigin }
}
