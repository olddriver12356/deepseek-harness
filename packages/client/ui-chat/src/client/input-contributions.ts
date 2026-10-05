/** Reversible custom input ownership for the generic Chat input renderer. */
import { Service, type Context } from '@deepseek-ai/cordis'
import type { MessageSource } from '@deepseek-ai/dsh-llm'
import { notifySubscribers } from '@deepseek-ai/dsh-client-store'

/** Custom renderers suppress generic input only for their effect-scoped source kinds. */
export interface IChatInputs {
  /**
   * Suppress generic input rendering while a custom Definition owns the source kind.
   * @param source - custom source kind handled by an installed Definition.
   * @returns idempotent disposer restoring generic rendering.
   */
  excludeSource(source: MessageSource['kind']): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context { /** Generic Chat input presentation ownership. */ chatInputs: IChatInputs }
}

/** Owns source-kind contributions; registrations use the caller's Cordis effect lifetime. */
export class ChatInputs extends Service implements IChatInputs {
  private readonly sources = new Map<MessageSource['kind'], number>()
  private readonly listeners = new Set<() => void>()
  /** @param ctx - owning Chat context. */
  constructor(ctx: Context) { super(ctx, 'chatInputs') }
  /** @inheritdoc */
  excludeSource(source: MessageSource['kind']): () => void {
    const dispose = this.ctx.effect(() => {
      this.sources.set(source, (this.sources.get(source) ?? 0) + 1)
      this.changed()
      return () => {
        const remaining = (this.sources.get(source) ?? 1) - 1
        if (remaining === 0) this.sources.delete(source)
        else this.sources.set(source, remaining)
        this.changed()
      }
    }, `ui-chat: input source ${source}`)
    return () => { void dispose() }
  }
  /**
   * Check active custom-renderer ownership for a recorded source kind.
   * @param source - recorded source kind.
   * @returns whether a custom renderer owns it.
   */
  excludes(source: MessageSource['kind']): boolean { return this.sources.has(source) }
  /**
   * Observe renderer ownership changes.
   * @param listener - definition-rebuild listener.
   * @returns unsubscribe.
   */
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private changed(): void { notifySubscribers(this.listeners, '[ui-chat] input contributions') }
}
