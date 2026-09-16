import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import type { SubprocessRuntime, SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import { inspectProject, validateAppUrl } from './manifest.ts'
import type { AppRegistration, AppSnapshot, AppLogs } from './types.ts'

export interface RuntimeConfig { startupTimeoutMs: number; graceMs: number; logBytes: number; portAttempts: number }
interface Run { snapshot: AppSnapshot; handle?: SubprocessHandle; cancelled: boolean }

/** Bind checks detect conflicts; the application still owns the eventual socket. */
async function available(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') resolve(false)
      else reject(error)
    })
    server.listen(port, host, () => server.close(error => error ? reject(error) : resolve(true)))
  })
}

/** Launch-only runtime over the existing managed subprocess capability. */
export class AppsRuntime {
  private runs = new Map<string, Run>()
  private reserved = new Set<number>()
  constructor(private subprocess: SubprocessRuntime, private config: RuntimeConfig) {}

  snapshot(app: AppRegistration): AppSnapshot {
    return this.runs.get(app.id)?.snapshot ?? { ...app, state: 'stopped', activeUrl: app.url, error: '' }
  }
  busy(id: string): boolean {
    const state = this.runs.get(id)?.snapshot.state
    return state === 'starting' || state === 'running'
  }
  logs(id: string): AppLogs {
    const handle = this.runs.get(id)?.handle
    return { stdout: handle?.collected.stdout?.readFrom(0).text ?? '', stderr: handle?.collected.stderr?.readFrom(0).text ?? '' }
  }
  forget(id: string): void { this.runs.delete(id) }

  async start(app: AppRegistration, selected?: string): Promise<AppSnapshot> {
    if (this.busy(app.id)) return this.snapshot(app)
    const run: Run = { snapshot: { ...app, state: 'starting', activeUrl: app.url, error: '' }, cancelled: false }
    this.runs.set(app.id, run)
    void this.launch(app, selected ?? app.script, run).catch((error) => {
      if (!run.cancelled) { run.snapshot.state = 'failed'; run.snapshot.error = String(error instanceof Error ? error.message : error) }
    })
    return run.snapshot
  }

  private async launch(app: AppRegistration, script: string, run: Run, retries = 2): Promise<void> {
    let port: number | undefined
    try {
      const inspection = await inspectProject(app.directory)
      if (!Object.hasOwn(inspection.scripts, script)) throw new Error('The selected package script no longer exists')
      // Script names are argv values; rejecting shell syntax also makes Windows shims safe.
      if (!/^[a-zA-Z0-9][a-zA-Z0-9:_./-]*$/.test(script)) throw new Error('Unsupported script name')
      const url = new URL(validateAppUrl(app.url))
      const host = url.hostname === '[::1]' ? '::1' : url.hostname
      for (let offset = 0; offset < (app.strategy === 'fixed' ? 1 : this.config.portAttempts); offset++) {
        const candidate = app.port + offset
        if (candidate > 65535) break
        if (!this.reserved.has(candidate)) {
          this.reserved.add(candidate)
          try {
            if (await available(candidate, host)) { port = candidate; break }
          } finally {
            if (port !== candidate) this.reserved.delete(candidate)
          }
        }
      }
      if (port === undefined) throw new Error('Port is occupied. Confirm the external app or choose another port')
      if (run.cancelled) return
      url.port = String(port)
      run.snapshot.activeUrl = url.href
      const executable = await this.subprocess.resolveExecutable(app.packageManager)
      if (run.cancelled) return
      const forwarded = app.strategy === 'long' ? ['--port', String(port)] : app.strategy === 'short' ? ['-p', String(port)] : []
      const args = ['run', script, ...(forwarded.length && app.packageManager === 'npm' ? ['--'] : []), ...forwarded]
      let argv = [executable, ...args]
      if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable)) {
        const shell = await this.subprocess.resolveExecutable('powershell.exe')
        const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`
        const command = `& ${[executable, ...args].map(quote).join(' ')}; exit $LASTEXITCODE`
        argv = [shell, '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')]
      }
      if (run.cancelled) return
      const handle = this.subprocess.spawn({ argv, cwd: inspection.directory,
        env: app.strategy === 'env' ? { PORT: String(port) } : {}, graceMs: this.config.graceMs,
        stdio: { stdin: 'ignore', stdout: { maxBytes: this.config.logBytes }, stderr: { maxBytes: this.config.logBytes } } })
      run.handle = handle
      let exited = false
      void handle.done.then((outcome) => {
        exited = true
        if (!run.cancelled) { run.snapshot.state = 'failed'; run.snapshot.error = `Application exited (${outcome.exitCode ?? outcome.signal})` }
      }, (error) => { exited = true; if (!run.cancelled) { run.snapshot.state = 'failed'; run.snapshot.error = String(error) } })
      const deadline = Date.now() + this.config.startupTimeoutMs
      while (!run.cancelled && !exited && Date.now() < deadline) {
        try {
          const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1500) })
          await response.body?.cancel()
          if (response.status >= 200 && response.status < 400 && !exited && !run.cancelled) { run.snapshot.state = 'running'; return }
        } catch { /* Server is still starting; bounded by the startup deadline. */ }
        await delay(300)
      }
      if (run.cancelled) return
      if (exited) {
        const output = this.logs(app.id)
        if (app.strategy !== 'fixed' && retries > 0 && port < 65535 && /EADDRINUSE|address already in use/i.test(output.stdout + output.stderr)) {
          this.reserved.delete(port)
          run.snapshot.state = 'starting'; run.snapshot.error = ''
          return await this.launch({ ...app, port: port + 1 }, script, run, retries - 1)
        }
        throw new Error(run.snapshot.error)
      }
      handle.terminate()
      await handle.waitForExit(AbortSignal.timeout(this.config.graceMs + 3000))
      throw new Error('Application readiness timed out; inspect its logs and port strategy')
    } finally { if (port !== undefined) this.reserved.delete(port) }
  }

  async stop(id: string): Promise<void> {
    const run = this.runs.get(id)
    if (!run) return
    run.cancelled = true
    run.handle?.terminate()
    if (run.handle && !await run.handle.waitForExit(AbortSignal.timeout(this.config.graceMs + 3000))) {
      run.snapshot.state = 'failed'; run.snapshot.error = 'Process tree did not exit'; throw new Error(run.snapshot.error)
    }
    run.snapshot.state = 'stopped'; run.snapshot.error = ''
  }

  async confirmExternal(app: AppRegistration): Promise<void> {
    if (this.busy(app.id)) throw new Error('Stop the managed app first')
    const response = await fetch(validateAppUrl(app.url), { redirect: 'manual', signal: AbortSignal.timeout(2000) })
    await response.body?.cancel()
    if (response.status < 200 || response.status >= 400) throw new Error('Application URL is not ready')
    this.runs.set(app.id, { cancelled: false, snapshot: { ...app, activeUrl: app.url, state: 'external', error: '' } })
  }
  async dispose(): Promise<void> { await Promise.all([...this.runs.keys()].map(id => this.stop(id))) }
}
