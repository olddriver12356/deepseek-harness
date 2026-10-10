/** Bind parent-specific child evidence into the static first-party migration inventory. */

import { createSessionFormatCatalog } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatCatalog, SessionFormatJsonValue } from '@deepseek-ai/dsh-session-format'
import { createSessionFormatV3ToV4, sessionFormatV3ToV4 } from '@deepseek-ai/dsh-session-format-v3-to-v4'
import { createLocalV4ToV5, localV4SessionFormatCodec, LOCAL_SESSION_EVENT_TYPES, sessionFormatV4ToV5 } from '@deepseek-ai/dsh-session-format-v4-to-v5'
import { sessionFormatCatalogOptions } from './generated.ts'

/**
 * Assemble a catalog whose V3→V4 edge knows one parent's historical children.
 * @param children - complete child evidence retained unchanged for the catalog's lifetime; an empty array declares no children.
 * @param localV4 - whether the source is explicitly identified as the pre-integration local V4 dialect.
 * @returns a catalog with independent restore state per artifact and unchanged current-format readers.
 */
export function createSessionFormatCatalogWithChildren(children: readonly SessionFormatJsonValue[], localV4 = false): SessionFormatCatalog {
  const migration = createSessionFormatV3ToV4(children, LOCAL_SESSION_EVENT_TYPES)
  return createSessionFormatCatalog({
    ...sessionFormatCatalogOptions,
    codecs: sessionFormatCatalogOptions.codecs.map(codec => localV4 && codec.version === 4 ? localV4SessionFormatCodec : codec),
    migrations: sessionFormatCatalogOptions.migrations.map(edge => edge === sessionFormatV3ToV4 ? migration
      : localV4 && edge === sessionFormatV4ToV5 ? createLocalV4ToV5(children) : edge),
  })
}
