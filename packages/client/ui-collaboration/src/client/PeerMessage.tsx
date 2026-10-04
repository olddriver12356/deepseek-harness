/** Distinct inert-text presentation of durable attributed Peer input. */
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
export type { PeerMessageData } from './peer-definition.ts'
import css from './Collaboration.module.css'

/** Peer keyed renderer props with the feature's own typed locale. */
export type PeerMessageProps = PropsRuntime<'conversation.chat.node', 'collaboration-peer'> & PropsLocale<'collaboration'>

/** @param props - one final attributed node; no Session or event scanning. @returns visibly attributed safe text. */
export function PeerMessage({ node, t }: PeerMessageProps) {
  const { source, content } = node.data
  return <article className={css.message} aria-label={t('peerMessage')}>
    <strong>{t('peerMessage')}</strong><p>{t('peerWarning')}</p>
    <dl><dt>{t('sender')}</dt><dd>{source.senderSessionId}</dd><dt>{t('recipient')}</dt><dd>{source.recipientSessionId}</dd>
      <dt>{t('connectionId')}</dt><dd>{source.connectionId}</dd><dt>{t('messageId')}</dt><dd>{source.messageId}</dd></dl>
    {content.map((block, index) => block.type === 'text' ? <p className={css.body} key={index}>{block.text}</p> : null)}
  </article>
}
