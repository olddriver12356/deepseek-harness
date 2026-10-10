/** V4 admission-policy metadata and identity-preserving released-V3 migration. */
import { isSessionFormatJsonObject, SessionFormatError } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatArtifact, SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatEvent, SessionFormatHeader } from '@deepseek-ai/dsh-session-format'
import { assertReleasedV3Header, releasedV3SessionFormatCodec, restoreReleasedV3Artifact } from '@deepseek-ai/dsh-session-format-v2-to-v3'

import { validatePolicySource } from '@deepseek-ai/dsh-session-format-v3-to-v4'

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

/** V4 retains V3 framing and adds hard admission-metadata validation before tail recovery. */
export const localV4SessionFormatCodec = Object.freeze({
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
