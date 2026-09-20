import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'

/** One serialized Bok process owns both browser mutations and Agent tool calls. */
export class PersonalWorker {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, {
    resolve(value: unknown): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  }>()
  private nextId = 0
  private failure: Error | undefined
  readonly ready: Promise<{ tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }>

  constructor(root: string, python: string, vault: string, personal: string, private readonly timeoutMs: number, profileVault?: string) {
    this.child = spawn(python, ['-u', resolve(root, 'runtime/bridge.py'), vault, personal, ...(profileVault ? [profileVault] : [])], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    let stderr = ''
    this.child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-8000) })
    this.ready = new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => this.stop(new Error('Personal Core startup timed out')), timeoutMs)
      const lines = createInterface({ input: this.child.stdout })
      lines.on('line', (line) => {
        try {
          const message = JSON.parse(line)
          if (message.ready === true) { clearTimeout(timer); resolveReady(message); return }
          const request = this.pending.get(message.id)
          if (!request) return
          clearTimeout(request.timer)
          this.pending.delete(message.id)
          if (typeof message.error === 'string') request.reject(new Error(message.error))
          else request.resolve(message.value)
        } catch (error) { this.stop(new Error('Invalid Personal Core response', { cause: error })) }
      })
      const fail = (error: Error) => {
        clearTimeout(timer)
        lines.close()
        this.failure = error
        rejectReady(error)
        for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error) }
        this.pending.clear()
      }
      this.child.once('error', fail)
      this.child.once('exit', () => fail(this.failure ?? new Error(`Personal Core exited: ${stderr}`)))
    })
  }

  /** @param message - bounded adapter operation. @returns the original Bok response. */
  async request<T>(message: Record<string, unknown>): Promise<T> {
    await this.ready
    if (this.failure) throw this.failure
    const id = ++this.nextId
    const line = JSON.stringify({ ...message, id }) + '\n'
    if (Buffer.byteLength(line) > 1_100_000) throw new Error('Personal Core request exceeds 1 MiB')
    return new Promise<T>((resolveResult, reject) => {
      const timer = setTimeout(() => this.stop(new Error('Personal Core request timed out; refresh before retrying a mutation')), this.timeoutMs)
      this.pending.set(id, { resolve: value => resolveResult(value as T), reject, timer })
      this.child.stdin.write(line, (error) => { if (error) this.stop(error) })
    })
  }

  private stop(error: Error): void { this.failure = error; this.child.kill() }

  /** Release the single writer and all outstanding requests when the plugin unloads. */
  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return
    const done = new Promise<void>(resolveDone => this.child.once('exit', () => resolveDone()))
    this.child.stdin.end()
    const timer = setTimeout(() => this.child.kill(), 5000)
    await done
    clearTimeout(timer)
  }
}
