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
  /**
   * Startup result containing the worker tool catalog; rejects if startup fails or times out.
   */
  readonly ready: Promise<{ tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }>

  constructor(root: string, python: string, vault: string, personal: string, private readonly timeoutMs: number, profileVault?: string) {
    this.child = spawn(python, ['-u', resolve(root, 'runtime/bridge.py'), vault, personal, ...(profileVault ? [profileVault] : [])], {
      stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    })
    let stderr = ''
    this.child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-8000) })
    this.ready = new Promise((resolveReady, rejectReady) => {
      const timer = setTimeout(() => { this.stop(new Error('Personal Core startup timed out')) }, timeoutMs)
      const lines = createInterface({ input: this.child.stdout })
      lines.on('line', (line) => {
        try {
          const message: unknown = JSON.parse(line)
          if (typeof message !== 'object' || message === null) throw new Error('Expected a worker response object')
          if ('ready' in message && message.ready === true) {
            if (!('tools' in message) || !Array.isArray(message.tools)) throw new Error('Missing worker tool catalog')
            const tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = []
            for (const item of message.tools) {
              const tool: unknown = item
              if (typeof tool !== 'object' || tool === null || !('name' in tool) || typeof tool.name !== 'string'
                || !('description' in tool) || typeof tool.description !== 'string' || !('inputSchema' in tool)
                || typeof tool.inputSchema !== 'object' || tool.inputSchema === null || Array.isArray(tool.inputSchema)) {
                throw new Error('Invalid worker tool catalog entry')
              }
              tools.push({ name: tool.name, description: tool.description, inputSchema: { ...tool.inputSchema } })
            }
            clearTimeout(timer); resolveReady({ tools }); return
          }
          if (!('id' in message) || typeof message.id !== 'number' || !Number.isSafeInteger(message.id)) {
            throw new Error('Invalid worker response identity')
          }
          const request = this.pending.get(message.id)
          if (!request) return
          clearTimeout(request.timer)
          this.pending.delete(message.id)
          if ('error' in message && typeof message.error === 'string') request.reject(new Error(message.error))
          else if ('value' in message) request.resolve(message.value)
          else request.reject(new Error('Missing worker response value'))
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
      this.child.once('exit', () => { fail(this.failure ?? new Error(`Personal Core exited: ${stderr}`)) })
    })
  }

  /**
   * Send one bounded operation to the single Personal Core writer.
   * @param message - Adapter operation serialized as one JSON line.
   * @returns Worker response; timeout terminates the writer and leaves mutation outcomes uncertain.
   */
  async request<T>(message: Record<string, unknown>): Promise<T> {
    await this.ready
    if (this.failure) throw this.failure
    const id = ++this.nextId
    const line = JSON.stringify({ ...message, id }) + '\n'
    if (Buffer.byteLength(line) > 1_100_000) throw new Error('Personal Core request exceeds 1 MiB')
    return new Promise<T>((resolveResult, reject) => {
      const timer = setTimeout(() => { this.stop(new Error('Personal Core request timed out; refresh before retrying a mutation')) }, this.timeoutMs)
      this.pending.set(id, { resolve: (value) => { resolveResult(value as T) }, reject, timer })
      this.child.stdin.write(line, (error) => { if (error) this.stop(error) })
    })
  }

  private stop(error: Error): void { this.failure = error; this.child.kill() }

  /** Release the single writer and all outstanding requests when the plugin unloads. */
  async close(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return
    const done = new Promise<void>(resolveDone => this.child.once('exit', () => { resolveDone() }))
    this.child.stdin.end()
    const timer = setTimeout(() => this.child.kill(), 5000)
    await done
    clearTimeout(timer)
  }
}
