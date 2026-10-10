/** Keep released V3-to-V4 checks independent of the integration's newer writer. */
import { createSessionFormatCatalog } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatJsonValue } from '@deepseek-ai/dsh-session-format'
import { sessionFormatCatalogOptions } from '../../session-format-catalog/src/generated.ts'
import { KNOWN_SESSION_EVENT_TYPES, SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import { validateInstalledCurrentSessionArtifact } from '../../session-format-catalog/src/current.ts'
import { assertReleasedV4Header, createSessionFormatV3ToV4, releasedV4SessionFormatCodec, restoreReleasedV4Artifact } from '../src/index.ts'

export { historicalSessionFormatCatalog } from '@deepseek-ai/dsh-session-format-catalog'

export function createSessionFormatCatalogWithChildren(children: readonly SessionFormatJsonValue[]) {
  return createSessionFormatCatalog({
    ...sessionFormatCatalogOptions,
    currentVersion: 4,
    codecs: sessionFormatCatalogOptions.codecs.filter(codec => codec.version <= 4),
    migrations: [...sessionFormatCatalogOptions.migrations.filter(edge => edge.toVersion <= 3), createSessionFormatV3ToV4(children)],
    currentEncoder: releasedV4SessionFormatCodec,
    restoreCurrent(artifact) {
      const restored = restoreReleasedV4Artifact(artifact, KNOWN_SESSION_EVENT_TYPES)
      validateInstalledCurrentSessionArtifact({ ...restored, header: { ...restored.header, version: SESSION_FORMAT_VERSION } })
      return restored
    },
    restoreTransformedCurrent: artifact => restoreReleasedV4Artifact(artifact, KNOWN_SESSION_EVENT_TYPES),
    restoreCurrentHeader(header) { assertReleasedV4Header(header); return header },
  })
}

export const sessionFormatCatalog = createSessionFormatCatalogWithChildren([])
