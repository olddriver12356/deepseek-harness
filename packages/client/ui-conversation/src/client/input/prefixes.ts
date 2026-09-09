/**
 * Composer send prefixes: the one way another plugin's Session-scoped
 * selection (an Expert, a Style, ...) rides along on the next message this
 * Session sends, without the composer importing that plugin. Contributor
 * order is fixed here rather than by registration order, so an Expert's
 * instructions always precede a Style's when both are active.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ComposerPrefixContribution, ComposerPrefixes } from '../contract/composer-prefixes.ts'

const CONTRIBUTOR_ORDER = ['experts', 'styles'] as const

/** The per-session composer-prefix registry (one instance per plugin fiber). */
export class ComposerPrefixRegistry implements ComposerPrefixes {
  private readonly bySession = new Map<SessionId, Map<string, string>>()

  /** @inheritdoc */
  set(sessionId: SessionId, sourceId: string, contribution: ComposerPrefixContribution | undefined): void {
    if (contribution === undefined) {
      this.bySession.get(sessionId)?.delete(sourceId)
      return
    }
    const bySource = this.bySession.get(sessionId) ?? new Map<string, string>()
    bySource.set(sourceId, contribution.text)
    this.bySession.set(sessionId, bySource)
  }

  /** @inheritdoc */
  resolve(sessionId: SessionId): string {
    const bySource = this.bySession.get(sessionId)
    if (bySource === undefined) return ''
    return CONTRIBUTOR_ORDER
      .map(sourceId => bySource.get(sourceId))
      .filter((text): text is string => text !== undefined && text !== '')
      .join('\n\n')
  }

  /** @inheritdoc */
  forget(sessionId: SessionId): void {
    this.bySession.delete(sessionId)
  }
}
