/** Local durable input-policy validation shared by historical and current readers. */
import { isSessionFormatJsonObject, SessionFormatError } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatEvent, SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'

function sources(event: SessionFormatEvent): readonly SessionFormatJsonObject[] {
  if (!isSessionFormatJsonObject(event.data)) return []
  const data = event.data
  let messages: readonly import('@deepseek-ai/dsh-session-format').SessionFormatJsonValue[]
  if (event.type === 'user/message') messages = [data]
  else if (event.type === 'agent/inbox/spliced') messages = Array.isArray(data['inserted']) ? data['inserted'] : []
  else if (event.type === 'session/title-llm-request') messages = Array.isArray(data['messages']) ? data['messages'] : []
  else if (event.type === 'personal/observation-request' && isSessionFormatJsonObject(data['request'])) {
    messages = Array.isArray(data['request']['messages']) ? data['request']['messages'] : []
  } else return []
  return messages.flatMap(message => isSessionFormatJsonObject(message) && isSessionFormatJsonObject(message['source']) ? [message['source']] : [])
}

/**
 * Validate local admission requirements and exact peer-message identities before replay.
 * @param event - Decoded event whose message sources require validation.
 */
export function validatePolicySource(event: SessionFormatEvent): void {
  for (const source of sources(event)) {
    const policy = source['requiredAdmissionPolicy']
    if (policy !== undefined && (typeof policy !== 'string' || policy.length === 0)) throw new SessionFormatError('requiredAdmissionPolicy must be a nonempty string')
    if (source['kind'] !== 'collaboration-peer') continue
    const keys = ['kind', 'requiredAdmissionPolicy', 'senderSessionId', 'recipientSessionId', 'connectionId', 'messageId']
    if (Object.keys(source).length !== keys.length || keys.some(key => typeof source[key] !== 'string'
      || source[key].length === 0 || /[\u0000-\u001f\u007f]/u.test(source[key]))
      || policy !== 'collaboration-peer' || source['senderSessionId'] === source['recipientSessionId']) {
      throw new SessionFormatError('collaboration-peer source requires exact identities and admission policy')
    }
  }
}

/**
 * Reject admission authority metadata that did not exist in released V3.
 * @param event - Historical event to validate.
 */
export function assertNoHistoricalAdmissionPolicy(event: SessionFormatEvent): void {
  for (const source of sources(event)) {
    if (source['kind'] === 'collaboration-peer' || source['requiredAdmissionPolicy'] !== undefined) {
      throw new SessionFormatError('format v3 cannot contain reserved V4 input admission metadata')
    }
  }
}
