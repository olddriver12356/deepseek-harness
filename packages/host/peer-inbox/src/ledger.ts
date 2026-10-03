/** Owner-private, bounded, no-eviction request ledger with write-before-dispatch durability. @module @deepseek-ai/dsh-peer-inbox/ledger */
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

/** Public request state; only completed states expose Assistant text. */
export interface Result {
  requestId: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'unknown'
  turn?: number
  text?: string
  failureCode?: string
}
/** Persisted request identity and its latest observation; never stores request text or secrets. */
export interface Entry { fingerprint: string; sessionId: string; messageId: string; result: Result }

/** One exclusive ledger writer; stale locks require an operator, never automatic replay. */
export class Ledger {
  private readonly entries = new Map<string, Entry>()
  private readonly path: string
  private readonly lockPath: string
  private lock: number | undefined
  constructor(private readonly root: string, private readonly capacity: number, private readonly outputBytes: number) {
    mkdirSync(root, { recursive: true, mode: 0o700 })
    const stat = lstatSync(root)
    if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()))) throw new Error('peer-inbox: ledger directory must be owner-private')
    this.path = join(root, 'requests.json')
    this.lockPath = join(root, 'writer.lock')
    this.lock = openSync(this.lockPath, 'wx', 0o600)
    try {
      writeFileSync(this.lock, String(process.pid)); fsyncSync(this.lock)
      let text: string | undefined
      try {
        const fileStat = lstatSync(this.path)
        if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > capacity * (outputBytes + 1024) + 128 || (process.platform !== 'win32' && ((fileStat.mode & 0o077) !== 0 || fileStat.uid !== process.getuid?.()))) throw new Error('peer-inbox: invalid ledger file')
        text = readFileSync(this.path, 'utf8')
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
      if (text !== undefined) {
        const data: unknown = JSON.parse(text)
        if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('entries' in data) || !Array.isArray(data.entries) || data.entries.length > capacity) throw new Error('peer-inbox: invalid ledger')
        for (const value of data.entries) {
          if (!validEntry(value, outputBytes) || this.entries.has(value.result.requestId)) throw new Error('peer-inbox: invalid ledger entry')
          const entry = value
          if (entry.result.status === 'queued' || entry.result.status === 'running') entry.result = { requestId: entry.result.requestId, status: 'unknown', failureCode: 'restart_execution_unknown', ...(entry.result.turn === undefined ? {} : { turn: entry.result.turn }) }
          this.entries.set(entry.result.requestId, entry)
        }
      }
      this.publish()
    } catch (error) { this.close(); throw error }
  }
  /** Number of retained request tombstones. */
  get size(): number { return this.entries.size }
  /**
   * Retained records for exact pending-message reconciliation.
   * @returns retained entries.
   */
  all(): readonly Entry[] { return [...this.entries.values()] }
  /**
   * Read a retained request.
   * @param id - exact request ID.
   * @returns retained entry, if present.
   */
  get(id: string): Entry | undefined { return this.entries.get(id) }
  /**
   * Commit an entry before it can authorize work.
   * @param entry - bounded request observation.
   */
  put(entry: Entry): void {
    if (this.lock === undefined || !validEntry(entry, this.outputBytes)) throw new Error('peer-inbox: ledger unavailable')
    if (!this.entries.has(entry.result.requestId) && this.size >= this.capacity) throw new Error('peer-inbox: ledger full')
    this.entries.set(entry.result.requestId, entry)
    this.publish()
  }
  /** Release the exclusive writer after callers have stopped using it. */
  close(): void {
    if (this.lock === undefined) return
    closeSync(this.lock); this.lock = undefined; unlinkSync(this.lockPath)
  }
  private publish(): void {
    const temporary = join(this.root, `.${randomUUID()}.tmp`)
    const fd = openSync(temporary, 'wx', 0o600)
    try { writeFileSync(fd, JSON.stringify({ version: 1, entries: [...this.entries.values()] })); fsyncSync(fd) } finally { closeSync(fd) }
    try { renameSync(temporary, this.path) } catch (error) { unlinkSync(temporary); throw error }
    if (process.platform !== 'win32') {
      const directory = openSync(this.root, 'r')
      try { fsyncSync(directory) } finally { closeSync(directory) }
    }
  }
}
function validEntry(value: unknown, maxBytes: number): value is Entry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<Entry>
  const result = entry.result
  if (typeof entry.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(entry.fingerprint) || typeof entry.sessionId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(entry.sessionId) || !result || typeof result !== 'object') return false
  return typeof entry.messageId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(entry.messageId)
    && Object.keys(entry).every(key => ['fingerprint', 'sessionId', 'messageId', 'result'].includes(key))
    && Object.keys(result).every(key => ['requestId', 'status', 'turn', 'text', 'failureCode'].includes(key))
    && typeof result.requestId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(result.requestId)
    && ['queued', 'running', 'completed', 'failed', 'unknown'].includes(result.status)
    && (result.turn === undefined || (Number.isSafeInteger(result.turn) && result.turn > 0))
    && (result.status === 'completed' ? typeof result.text === 'string' : result.text === undefined)
    && (result.failureCode === undefined || (typeof result.failureCode === 'string' && /^[a-z_-]{1,80}$/.test(result.failureCode)))
    && Buffer.byteLength(JSON.stringify(result)) <= maxBytes
}
