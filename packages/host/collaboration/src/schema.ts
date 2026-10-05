/** Host domain assembly over the platform-neutral authoritative record parser. */
import type { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { collaborationStateSchema } from './record-schema.ts'
export * from './record-schema.ts'

/** Single authoritative version-1 record; invalid data rejects the whole domain open. */
export const collaborationDomain = defineDomain({
  name: 'collaboration', version: 1,
  tables: { state: domainTable<'current', z.infer<typeof collaborationStateSchema>>(collaborationStateSchema) },
})
