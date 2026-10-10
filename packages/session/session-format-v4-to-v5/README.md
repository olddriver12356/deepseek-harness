---
description: "V5 Session admission metadata and explicit migration of the pre-integration local V4 dialect."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v4-to-v5

## Summary

This library preserves upstream native V4 messages and local required input admission in a distinct V5 successor. It performs no file I/O. JSONL persistence prepares, verifies and atomically publishes the new generation while retaining every predecessor.

## Table of Contents

- [Conversion and validation](#conversion-and-validation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Conversion and validation

Native upstream V4 uses the ordinary adjacent migration. It retains event payloads, identities, sequence coordinates and historical delivery generations. Current V5 validates native upstream message rules and required input policies. Active V5 delivery markers must refer to an earlier event and the correct Session, except within an inherited parent prefix.

The pre-integration local writer also used version 4, with V3 message representation and additional admission metadata. Its header cannot distinguish it from upstream V4. Configure `session-persistence-jsonl.localV4SessionIds` with the exact identities known to originate from that writer. Only those V4 artifacts use `localV4SessionFormatCodec` and `createLocalV4ToV5`; all other V4 artifacts use native upstream decoding. No content heuristic or automatic fallback selects a dialect. The selection does not affect an already published V5 artifact.

Local conversion reuses upstream V3 transformations, including tool-role conversion, producer-owned sources, reference remapping and parent catalog completion. It explicitly preserves `experts/delegation`, `personal/observation-request` and `personal/observation-result`; arbitrary unknown required events remain refused. Required policy attribution is validated before recoverable-tail handling and retained during conversion. Historical V3 cannot acquire reserved V4 admission metadata.

Collaboration attribution requires exactly `kind`, `requiredAdmissionPolicy`, `senderSessionId`, `recipientSessionId`, `connectionId` and `messageId`. The policy must equal `collaboration-peer`; identities must be nonempty and contain no control characters, and sender and recipient must differ. Runtime admission remains the Agent owner's responsibility.

## Model Experience

### Historical restoration

#### What the model sees

Recorded messages remain unchanged in native V4 conversion. Explicit local V4 conversion lifts `tool/result` messages to `role: 'tool'` and preserves their content using the upstream transformation.

#### Token effect

The migration adds no prompt or tool schema and preserves recorded text.

#### KV Cache effect

The native V4 edge preserves existing model records. Local V4 conversion applies the same representation changes as upstream V3 conversion; it does not introduce a new system prompt or tool schema.

## Known Limitations and Deferred Work

- Operators must establish the exact local V4 Session identities before activation. A mixed corpus cannot be safely classified from its version header alone.
- Migration supplies no downgrade path and never rewrites a committed predecessor. Parent conversion requires complete historical child evidence.

**Runtime invariant:** No companion is published. The selected decoder and adjacent migration validate their owned artifact directly.

### Dev Note

V5 resolves a real version-number collision between the local and upstream writers. The explicit Session identity list preserves that distinction without weakening native upstream admission.
