/** React-free owner of committed Remote views, reconnect generations and disposal. */
import type { ClientRemote, CollaborationControlSnapshot, RemoteResult, SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'
import type { CollaborationData } from './types.ts'

/** A Session's authoritative last complete view; revision gaps are valid complete replacements. */
export class CollaborationDataSource {
  private value: CollaborationData = { view: null, phase: 'loading', error: null }
  private readonly listeners = new Set<() => void>()
  private stream
  private consumer: Promise<void> | undefined
  private disposed = false
  private ended = false
  private refreshing: Promise<void> | undefined

  /** @param remote - generated Remote owner and carrier-supervised stream factory. @param sessionId - ordinary viewer. */
  constructor(private readonly remote: ClientRemote, private readonly sessionId: SessionId) {
    this.stream = this.makeStream()
  }

  private makeStream() {
    return this.remote.$stream<CollaborationControlSnapshot>({
      name: 'Collaboration committed views',
      open: signal => this.remote.collaboration.controlFollow({ sessionId: this.sessionId }, signal),
      ended: () => new Error('Collaboration follow ended; refresh to reopen the view'),
    })
  }

  /**
   * Read the last complete committed view without starting a request.
   * @returns the stable current committed-view snapshot.
   */
  readonly getSnapshot = (): CollaborationData => this.value

  /**
   * Observe complete view replacements and connection failures.
   * @param listener - committed-view observer.
   * @returns disposer removing this observer.
   */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /** Start the single carrier-supervised consumer once. */
  start(): void {
    if (this.disposed || this.consumer !== undefined) return
    this.consumer = this.consume()
  }

  /**
   * Refresh the authorized view and reopen a terminally ended stream; concurrent calls share one request.
   * @returns completion after a fresh authorized snapshot and requested stream replacement.
   */
  refresh(): Promise<void> {
    return this.refreshing ??= this.refreshNow().finally(() => { this.refreshing = undefined })
  }

  private async refreshNow(): Promise<void> {
    try {
      const view = valueOf(await this.remote.collaboration.controlSnapshot({ sessionId: this.sessionId }))
      if (this.disposed) return
      this.replace(view)
      if (this.ended) {
        await this.stream.dispose()
        if (this.isDisposed()) return
        this.stream = this.makeStream()
        this.ended = false
      } else this.stream.restart()
      this.start()
    } catch (error) {
      this.fail(error)
    }
  }

  /**
   * Stop updates and drain the owned stream consumer before releasing observers.
   * @returns quiescence after every stream generation is cancelled.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    await this.stream.dispose()
    await this.consumer
    this.listeners.clear()
  }

  private async consume(): Promise<void> {
    try {
      for await (const item of this.stream) {
        if (this.disposed) return
        this.replace(item.value)
        item.accept()
      }
    } catch (error) {
      this.fail(error)
    } finally {
      this.ended = true
      this.consumer = undefined
    }
  }

  private replace(view: CollaborationControlSnapshot): void {
    if (this.value.view !== null && view.revision < this.value.view.revision) return
    this.value = { view, phase: 'ready', error: null }
    notifySubscribers(this.listeners, '[ui-collaboration]')
  }

  private fail(error: unknown): void {
    if (this.disposed) return
    this.value = { ...this.value, phase: 'failed', error: error instanceof Error ? error.message : String(error) }
    notifySubscribers(this.listeners, '[ui-collaboration]')
  }

  private isDisposed(): boolean { return this.disposed }
}

/**
 * Unwrap a successful Remote settlement or throw its exact diagnostic.
 * @param result - generated Remote settlement.
 * @returns successful value.
 */
export function valueOf<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}
