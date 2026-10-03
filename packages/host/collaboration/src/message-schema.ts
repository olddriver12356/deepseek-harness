/** Platform-neutral request and attributed source schema. */
import { z } from 'zod'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { connectionIdSchema, peerMessageIdSchema, requestIdSchema, sessionIdSchema } from './record-schema.ts'

/** Strict model request; sender identity comes only from the acting Agent. */
export const sendPeerRequestSchema = z.strictObject({ connectionId: connectionIdSchema, text: z.string(), requestId: requestIdSchema })

/** Strict persisted attribution, including the policy needed before restored input can enter a request. */
export const peerSourceSchema = z.strictObject({
  kind: z.literal('collaboration-peer'), requiredAdmissionPolicy: z.literal('collaboration-peer'),
  senderSessionId: sessionIdSchema.transform((value): SessionId => value),
  recipientSessionId: sessionIdSchema.transform((value): SessionId => value),
  connectionId: connectionIdSchema, messageId: peerMessageIdSchema,
}).refine(source => source.senderSessionId !== source.recipientSessionId, 'sender and recipient must differ').readonly()
