/** V4 admission-policy metadata and identity-preserving released-V3 migration. */
import { defineSessionFormatMigration, isSessionFormatJsonObject, SessionFormatError, sessionFormatCount } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatArtifact, SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatEvent, SessionFormatHeader, SessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import { assertReleasedV3Header, releasedV3SessionFormatCodec, restoreReleasedV3Artifact } from '@deepseek-ai/dsh-session-format-v2-to-v3'

export { releasedV3SessionFormatCodec } from '@deepseek-ai/dsh-session-format-v2-to-v3'

/**
 * Validate the V4 version and retained V3 logical header fields.
 * @param header - logical V4 header.
 */
export function assertV4Header(header: SessionFormatHeader): void {
  if (header.version !== 4) throw new SessionFormatError('expected format v4 header')
  assertReleasedV3Header({ ...header, version: 3 })
}

function headerV3(value: unknown): SessionFormatHeader {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 4) throw new SessionFormatError('expected format v4 physical header')
  return { ...value, version: 3 } as SessionFormatHeader
}

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

function validatePolicySource(event: SessionFormatEvent): void {
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

/** V4 retains V3 framing and adds hard admission-metadata validation before tail recovery. */
export const v4SessionFormatCodec = Object.freeze({
  version: 4,
  decodeHeader(value: unknown) { return { ...releasedV3SessionFormatCodec.decodeHeader(headerV3(value)), version: 4 } },
  createDecoder(value, recovery) {
    const decoder = releasedV3SessionFormatCodec.createDecoder(headerV3(value), recovery)
    return {
      header: { ...decoder.header, version: 4 },
      decodeRow(row, context) {
        if (isSessionFormatJsonObject(row)) validatePolicySource(row as SessionFormatEvent)
        decoder.decodeRow(row, {
          emitRun: context.emitRun.bind(context),
          emitEvent(event) { validatePolicySource(event); context.emitEvent(event) },
        })
      },
      finish: context => decoder.finish(context),
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertV4Header(header)
    return { ...releasedV3SessionFormatCodec.encodeHeader({ ...header, version: 3 }, inheritedEventCount), version: 4 }
  },
  encodeEvent(event) { validatePolicySource(event); return releasedV3SessionFormatCodec.encodeEvent(event) },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)

/**
 * Validate V4 source requirements and retained V3 structural relationships without rewriting events.
 * @param artifact - decoded V4 artifact.
 * @param knownEventTypes - installed required event inventory.
 * @returns the unchanged artifact after validation.
 */
export function restoreV4Artifact(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): SessionFormatArtifact {
  assertV4Header(artifact.header)
  for (const event of artifact.events) validatePolicySource(event)
  restoreReleasedV3Artifact({ ...artifact, header: { ...artifact.header, version: 3 } }, knownEventTypes)
  return artifact
}

/** Identity migration: preserves events and inherited cut; V3 cannot retroactively acquire V4 admission semantics. */
export const sessionFormatV3ToV4 = defineSessionFormatMigration({
  name: '@deepseek-ai/dsh-session-format-v3-to-v4', fromVersion: 3, toVersion: 4,
  migrateHeader(header) { assertReleasedV3Header(header); return { ...header, version: 4 } },
  validateTargetHeader: assertV4Header,
  createStage(input) {
    let count = 0
    let cut = input.sourceInheritedEventCount
    return {
      ...(cut === undefined ? {} : { headerInheritedEventCount: cut }),
      transformEvent(event, context) {
        if (event.seq !== count++) throw new SessionFormatError('format v3 source events must be dense')
        for (const source of sources(event)) {
          if (source['kind'] === 'collaboration-peer' || source['requiredAdmissionPolicy'] !== undefined) {
            throw new SessionFormatError('format v3 cannot contain reserved V4 input admission metadata')
          }
        }
        if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data) && event.data['inherited'] === true) {
          if (cut !== undefined && cut !== event.seq) throw new SessionFormatError('inherited cut differs from source marker')
          cut = event.seq
        }
        context.emitEvent(event)
      },
      transformRun(run, context) { for (const event of run.expand()) this.transformEvent(event, context) },
      finish() {
        const inherited = input.sourceHeader.isSeeded ? sessionFormatCount(cut, 'source inherited cut') : 0
        if (inherited > count) throw new SessionFormatError('source inherited cut exceeds event count')
        return inherited
      },
    }
  },
})
