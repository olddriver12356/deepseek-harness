/** V5 preserves upstream native messages and adds required input admission. */

import { defineSessionFormatMigration, isSessionFormatJsonObject, SessionFormatError } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatArtifact, SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatEvent, SessionFormatHeader, SessionFormatJsonValue, SessionFormatMigration } from '@deepseek-ai/dsh-session-format'
import { assertReleasedV4Header, createSessionFormatV3ToV4, releasedV4SessionFormatCodec, restoreReleasedV4Artifact, validateDeliveryAccepted, validatePolicySource } from '@deepseek-ai/dsh-session-format-v3-to-v4'
import { localV4SessionFormatCodec } from './local-v4.ts'

export { releasedV4SessionFormatCodec, localV4SessionFormatCodec }
export { assertV4Header as assertLocalV4Header, restoreV4Artifact as restoreLocalV4Artifact } from './local-v4.ts'

/** Historical local events are explicit; arbitrary required extensions remain refused. */
export const LOCAL_SESSION_EVENT_TYPES: ReadonlySet<string> = new Set([
  'experts/delegation', 'personal/observation-request', 'personal/observation-result',
])

/**
 * Validate the current header while preserving the released V4 header contract.
 * @param header - Current V5 header to validate.
 */
export function assertV5Header(header: SessionFormatHeader): void {
  if (header.version !== 5) throw new SessionFormatError('expected format v5 header')
  assertReleasedV4Header({ ...header, version: 4 })
}

function physicalV4(value: unknown): SessionFormatHeader {
  if (!isSessionFormatJsonObject(value) || value['version'] !== 5) throw new SessionFormatError('expected format v5 physical header')
  return { ...value, version: 4 } as SessionFormatHeader
}

/** Current physical framing validates admission metadata before recoverable-tail handling. */
export const v5SessionFormatCodec = Object.freeze({
  version: 5,
  decodeHeader(value: unknown) {
    return { ...releasedV4SessionFormatCodec.decodeHeader(physicalV4(value)), version: 5 }
  },
  createDecoder(value, recovery) {
    const decoder = releasedV4SessionFormatCodec.createDecoder(physicalV4(value), recovery)
    return {
      ...decoder,
      header: { ...decoder.header, version: 5 },
      decodeRow(row, context) {
        if (isSessionFormatJsonObject(row)) validatePolicySource(row as SessionFormatEvent)
        decoder.decodeRow(row, {
          emitRun: context.emitRun.bind(context),
          emitEvent(event) { validatePolicySource(event); context.emitEvent(event) },
        })
      },
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertV5Header(header)
    return { ...releasedV4SessionFormatCodec.encodeHeader({ ...header, version: 4 }, inheritedEventCount), version: 5 }
  },
  encodeEvent(event) { validatePolicySource(event); return releasedV4SessionFormatCodec.encodeEvent(event) },
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)

/**
 * Validate current artifacts, including active V5 delivery coordinates.
 * @param artifact - V5 artifact.
 * @param knownEventTypes - installed vocabulary.
 * @returns unchanged artifact.
 */
export function restoreV5Artifact(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): SessionFormatArtifact {
  assertV5Header(artifact.header)
  for (const event of artifact.events) validatePolicySource(event)
  restoreReleasedV4Artifact({ ...artifact, header: { ...artifact.header, version: 4 } }, knownEventTypes, 5)
  return artifact
}

/** Native upstream V4 migrates without changing event values or historical delivery coordinates. */
export const sessionFormatV4ToV5 = defineSessionFormatMigration({
  name: '@deepseek-ai/dsh-session-format-v4-to-v5', fromVersion: 4, toVersion: 5,
  migrateHeader(header) { assertReleasedV4Header(header); return { ...header, version: 5 } },
  validateTargetHeader: assertV5Header,
  createStage(input) {
    let count = 0
    let cut = input.sourceInheritedEventCount ?? (input.sourceHeader.isSeeded ? undefined : 0)
    let foreignDeliverySeq: number | undefined
    return {
      ...(cut === undefined ? {} : { headerInheritedEventCount: cut }),
      transformEvent(event, context) {
        if (event.seq !== count++) throw new SessionFormatError('format v4 source events must be dense')
        validatePolicySource(event)
        const deliveryId = validateDeliveryAccepted(event, 4)
        if (event.type === 'session-log-deepseek/delivery-accepted' && isSessionFormatJsonObject(event.data)
          && event.data['sessionFormatVersion'] === 5) throw new SessionFormatError('format v4 delivery marker claims target format v5')
        if (deliveryId !== undefined && deliveryId !== input.sourceHeader.id) foreignDeliverySeq = event.seq
        if (event.type === 'session/end-seed' && isSessionFormatJsonObject(event.data) && event.data['inherited'] === true) cut = event.seq
        context.emitEvent(event)
      },
      transformRun(run, context) { for (const event of run.expand()) this.transformEvent(event, context) },
      finish() {
        if (cut === undefined || cut > count) throw new SessionFormatError('invalid V4 inherited cut')
        if (input.sourceInheritedEventCount !== undefined && input.sourceInheritedEventCount !== cut) throw new SessionFormatError('V4 inherited cut disagrees with its source marker')
        if (foreignDeliverySeq !== undefined && (input.sourceHeader.parentSession === undefined || foreignDeliverySeq >= cut)) throw new SessionFormatError('current-generation delivery marker names the wrong Session')
        return cut
      },
    }
  },
})

/**
 * Convert an explicitly identified local V4 source through the upstream V3 transformations.
 * @param children - complete historical child evidence.
 * @returns the alternative V4-to-V5 edge; source files remain immutable.
 */
export function createLocalV4ToV5(children: readonly SessionFormatJsonValue[]): SessionFormatMigration {
  const native = createSessionFormatV3ToV4(children, LOCAL_SESSION_EVENT_TYPES, true)
  return defineSessionFormatMigration({
    ...sessionFormatV4ToV5,
    createStage(input) {
      const stage = native.createStage({ ...input,
        sourceHeader: { ...input.sourceHeader, version: 3 },
        targetHeader: { ...input.targetHeader, version: 4 },
      })
      return {
        ...(stage.headerInheritedEventCount === undefined ? {} : { headerInheritedEventCount: stage.headerInheritedEventCount }),
        transformEvent(event, context) {
          validatePolicySource(event)
          const localDelivery = event.type === 'session-log-deepseek/delivery-accepted'
            && isSessionFormatJsonObject(event.data) && event.data['sessionFormatVersion'] === 4
          const source = localDelivery
            ? { ...event, data: { ...(event.data as Record<string, SessionFormatJsonValue>), sessionFormatVersion: 3 } }
            : event
          stage.transformEvent(source, {
            emitRun: context.emitRun.bind(context),
            emitEvent(target) {
              context.emitEvent(localDelivery && target.type === event.type
                ? { ...target, data: { ...(target.data as Record<string, SessionFormatJsonValue>), sessionFormatVersion: 4 } }
                : target)
            },
          })
        },
        transformRun(run, context) { for (const event of run.expand()) this.transformEvent(event, context) },
        finish: context => stage.finish(context),
      }
    },
  })
}
