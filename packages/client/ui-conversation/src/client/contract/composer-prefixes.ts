import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One named contributor's slice of the automatic send prefix. */
export interface ComposerPrefixContribution {
  readonly text: string
}

/**
 * The registry face other plugins reach through `ctx.conversation.prefixes`:
 * prose prepended ahead of every message a Session sends, keyed by contributor
 * so independent plugins (Expert, Style, ...) never clobber each other's slice.
 */
export interface ComposerPrefixes {
  /**
   * Raise or clear this Session's contribution under `sourceId`.
   * @param sessionId - Session whose outgoing prefix is affected.
   * @param sourceId - contributor identity (e.g. `'experts'`, `'styles'`).
   * @param contribution - contribution to raise, or undefined to clear it.
   */
  set(sessionId: SessionId, sourceId: string, contribution: ComposerPrefixContribution | undefined): void
  /**
   * Resolve this Session's joined prefix text in fixed contributor order.
   * @param sessionId - Session to resolve.
   * @returns joined prefix text, or `''` when no contributor is active.
   */
  resolve(sessionId: SessionId): string
  /**
   * Drop one Session's contributions from every contributor.
   * @param sessionId - Session being released.
   */
  forget(sessionId: SessionId): void
}
