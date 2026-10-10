import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter, type StreamChunk } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as peer from '../src/index.ts'
let ctx: Context | undefined
let root: string | undefined
class Model extends LlmAdapter {
  override async * stream(): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: 'Loader reply' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
afterEach(async () => {
  await ctx?.fiber.dispose()
  if (root) await rm(root, { recursive: true, force: true })
  delete process.env.DSH_PEER_LOADER_TOKEN
})
it('boots the opt-in service through Loader and records plugin input and terminal output', async () => {
  root = await mkdtemp(join(tmpdir(), 'peer-loader-'))
  process.env.DSH_PEER_LOADER_TOKEN = 'test-only-loader-secret-at-least-32-bytes'
  const config = { tokenEnv: 'DSH_PEER_LOADER_TOKEN', port: 0, ledgerDir: root, allowedSessionIds: ['owner'], maxRequestBytes: 32768, maxOutputBytes: 8192, maxConcurrentRequests: 4, maxPendingRequests: 4, maxLedgerEntries: 10, requestTimeoutMs: 5000, executionTimeoutMs: 5000 }
  const modules = new Map<string, unknown>([
    ['llm', LlmRuntime], ['session', SessionStore], ['projection', SessionProjectionRegistry], ['prompt', SystemPrompt], ['tools', ToolRuntime], ['agents', AgentRegistry], ['loop', AgentLoop], ['peer', peer],
  ])
  const rows = [...modules.keys()].map(name => ({ name, ...(name === 'peer' ? { config } : name === 'loop' ? { config: { agents: [] } } : {}) }))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify(rows))
  ctx = new Context()
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  ctx.loader.internal = { version: 'v2', async import(specifier: string) { if (!modules.has(specifier)) throw new Error(specifier); return modules.get(specifier) } } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  expect([...ctx.loader.entries()].filter(entry => !entry.disabled && entry.fiber === undefined)).toEqual([])
  ctx.llm.registerAdapter(['mock'], new Model())
  const { agent } = await ctx.agents.create({ sessionId: SessionId('owner'), agentOptions: { provider: 'mock', model: 'mock' } })
  const base = `http://127.0.0.1:${ctx.peerInbox.port}`
  const headers = { authorization: `Bearer ${process.env.DSH_PEER_LOADER_TOKEN}`, 'content-type': 'application/json' }
  const health = await (await fetch(base + '/v1/health', { headers })).json() as { runtimeId: string }
  const response = await fetch(base + '/v1/requests', { method: 'POST', headers, body: JSON.stringify({ requestId: 'loader-1', runtimeId: health.runtimeId, sessionId: 'owner', text: 'Loader input' }) })
  expect(response.status).toBe(202)
  await agent.whenIdle()
  const result: unknown = await (await fetch(base + '/v1/requests/loader-1', { headers })).json()
  expect(result).toEqual({ requestId: 'loader-1', status: 'completed', turn: 1, text: 'Loader reply' })
  const transcript = agent.session.snapshotEvents().flatMap<{ role: string; source: import('@deepseek-ai/dsh-llm').MessageSource | undefined; content: readonly import('@deepseek-ai/dsh-llm').ContentBlock[] }>((event) => {
    if (event.type === 'user/message') return [{ role: 'user', source: event.data.source, content: event.data.content }]
    if (event.type === 'assistant/message') return [{ role: 'assistant', source: undefined, content: event.data.message.content }]
    return []
  })
  expect(transcript).toMatchInlineSnapshot(`
    [
      {
        "content": [
          {
            "text": "Loader input",
            "type": "text",
          },
        ],
        "role": "user",
        "source": {
          "kind": "peer-inbox",
        },
      },
      {
        "content": [
          {
            "text": "Loader reply",
            "type": "text",
          },
        ],
        "role": "assistant",
        "source": undefined,
      },
    ]
  `)
})
