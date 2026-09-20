import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, extname, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-tools'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { PersonalWorker } from './worker.ts'
import { saveQuickNote } from './quick-note.ts'
import { ConversationObserver, type ObserverConfig } from './observer.ts'

export const name = 'ui-personal'
export const inject = ['webServer', 'connection', 'tools']
export interface Config {
  /** Local Bok runtime Vault, separate from the user's knowledge Vault. */
  vaultRoot: string
  /** Private root outside the runtime Vault and any Git repository. */
  personalCoreRoot: string
  /** Python 3 executable. */
  python: string
  /** Whole worker request deadline in milliseconds. */
  requestTimeoutMs: number
  /** Owner's Vault; quick notes write exclusively to Ideas/Draft. */
  ideasVaultRoot: string
  /** Explicit opt-in and resource limits for automatic observation of new conversations. */
  observer?: ObserverConfig | undefined
}
export const Config: z<Config> = z.object({
  vaultRoot: z.string().required(), personalCoreRoot: z.string().required(),
  python: z.string().required(), requestTimeoutMs: z.number().step(1).min(1000).required(),
  ideasVaultRoot: z.string().required(),
  observer: z.union([z.const(undefined), z.object({
    enabled: z.boolean().required(),
    maxInputBytes: z.number().step(1).min(1024).max(100000).required(),
    maxOutputTokens: z.number().step(1).min(1).required(),
    maxOutputBytes: z.number().step(1).min(1).max(100000).required(),
    maxPendingTurns: z.number().step(1).min(1).max(100).required(),
    timeoutMs: z.number().step(1).min(1000).max(300000).required(),
  })]),
})
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PREFIX = '/personal'
const STATIC_FILE_NAMES = [
  'index.html', 'app.js', 'styles.css', 'atlas-physics.js', 'dsh-embed.css', 'dsh-vault-profile.js', 'dsh-observer.js',
  'quick-note.html', 'quick-note-window.js', 'quick-note-window.css',
].join('|').replace(/\./g, '\\.')
const STATIC_FILE_PATTERN = new RegExp(`^(?:${STATIC_FILE_NAMES}|assets/[a-zA-Z0-9._-]+)$`)
const INJECTED_HEAD_TAGS = '<link rel="stylesheet" href="./dsh-embed.css">'
  + '<script src="./dsh-vault-profile.js" defer></script><script src="./dsh-observer.js" defer></script></head>'
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
}
const STATIC_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
  + "font-src 'self'; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'"

/** Mount the original Bok page and restricted browser API under DSH authentication. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const worker = new PersonalWorker(
    ROOT, config.python, config.vaultRoot, config.personalCoreRoot, config.requestTimeoutMs, config.ideasVaultRoot,
  )
  ctx.effect(() => () => worker.close(), 'personal: Python writer')
  const { tools } = await worker.ready
  let observer: ConversationObserver | undefined
  if (config.observer) {
    if (!ctx.get('llm')) throw new Error('Automatic personal observation requires the LLM service')
    const saved = await worker.request<{ enabled?: boolean }>({ kind: 'observer', action: 'settings' })
    const enabled = saved.enabled ?? config.observer.enabled
    if (saved.enabled === undefined) await worker.request({ kind: 'observer', action: 'settings', enabled })
    const observeTool = tools.find(tool => tool.name === 'bok_observe_conversation')
    if (!observeTool) throw new Error('Personal Core did not expose bok_observe_conversation')
    const signalItems = (observeTool.inputSchema.properties as Record<string, { items?: unknown }>).personal_signals?.items
    observer = new ConversationObserver(ctx, worker, config.observer, enabled, signalItems)
    const observerRef = observer
    ctx.effect(() => () => observerRef.close(), 'personal: automatic observer')
  }
  for (const tool of tools) {
    ctx.effect(() => ctx.tools.register({
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      isConcurrencySafe: () => false,
      output: {
        schema: { type: 'object' },
        render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      execute: async (args: Record<string, unknown>, exec: { signal: AbortSignal }) => {
        exec.signal.throwIfAborted()
        const result = await worker.request<{ isError: boolean; structuredContent: unknown; content: Array<{ text: string }> }>({
          kind: 'tool', name: tool.name, arguments: args,
        })
        exec.signal.throwIfAborted()
        if (result.isError) throw new Error(result.content.map(item => item.text).join('\n'))
        return result.structuredContent
      },
    } as ToolDefinition), `personal: ${tool.name}`)
  }
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: PREFIX, handler: async (req, res) => {
    const rejection = ctx.connection.requestRejection(req)
    if (rejection !== undefined) { res.writeHead(rejection); res.end(); return }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = decodeURIComponent(url.pathname.slice(PREFIX.length))
    if (path === '/api/quick-note' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return
    }
    const isApiPath = path.startsWith('/api/bok/v1/person/') || path === '/api/quick-note'
      || path === '/api/vault-profile' || path === '/api/observer'
    if (isApiPath) {
      if (!['GET', 'POST'].includes(req.method ?? '')) { res.writeHead(405); res.end(); return }
      let body = ''
      let bytes = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > 1_048_576) { res.writeHead(413); res.end(); return }
        chunks.push(chunk)
      }
      body = Buffer.concat(chunks).toString('utf8')
      if (path === '/api/observer') {
        try {
          if (req.method === 'POST') {
            const payload = JSON.parse(body)
            const isValid = payload && Object.keys(payload).length === 1 && typeof payload.enabled === 'boolean'
            if (!observer || !isValid) throw new Error('Invalid observer switch')
            await observer.setEnabled(payload.enabled)
          }
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(observer?.status() ?? { enabled: false, pending: 0, status: 'not_configured', observations: 0 }))
        } catch { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end('{"error":"observer_update_failed"}') }
        return
      }
      if (path === '/api/vault-profile') {
        try {
          const payload = req.method === 'GET' ? { action: 'status' } : JSON.parse(body)
          const result = await worker.request({ kind: 'profile', payload })
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result))
        } catch {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: '同步未完成。请刷新预览，检查冲突、共享权限和 Vault 写入保护。原始记忆操作不会被自动重试。' }))
        }
        return
      }
      if (path === '/api/quick-note') {
        try {
          const result = await saveQuickNote(config.ideasVaultRoot, JSON.parse(body))
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(result))
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: { message: '保存失败，草稿已保留。请检查写入权限和 Vault 同步状态后重试。' } }))
        }
        return
      }
      try {
        const result = await worker.request<{ status: number; body: string; contentType: string; profileWarning?: string }>({
          kind: 'ui', method: req.method, target: path + url.search, body,
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': req.headers['idempotency-key'] ?? '' },
        })
        if (result.profileWarning) res.setHeader('X-Vault-Profile-Warning', result.profileWarning)
        res.writeHead(result.status, { 'Content-Type': result.contentType }); res.end(result.body)
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'Personal Core unavailable; refresh before retrying.' } }))
      }
      return
    }
    if (!['GET', 'HEAD'].includes(req.method ?? '')) { res.writeHead(405); res.end(); return }
    if (path === '') { res.writeHead(302, { Location: '/personal/' }); res.end(); return }
    const file = path === '/' ? 'index.html' : path.slice(1)
    if (!STATIC_FILE_PATTERN.test(file)) { res.writeHead(404); res.end(); return }
    try {
      let content: Buffer | string = await readFile(resolve(ROOT, 'vendor/bok/AI-Second-Brain-UI', file))
      if (file === 'index.html') content = content.toString().replace('</head>', INJECTED_HEAD_TAGS)
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[extname(file)] ?? 'application/octet-stream',
        'Content-Security-Policy': STATIC_CSP,
      })
      res.end(req.method === 'HEAD' ? undefined : content)
    } catch { res.writeHead(404); res.end() }
  } }), 'personal: authenticated page and API')
}
