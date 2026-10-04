---
description: "Identity-preserving V3-to-V4 Session migration and required input-policy validation."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v3-to-v4

English | [中文](README.zh.md)

## Summary

This reference defines the adjacent V3-to-V4 Session migration. Persistence consumes the package through the static format catalog. It performs no file I/O; the JSONL owner publishes immutable generation successors.

## Conversion and validation

The edge changes only the header version. Events, message identities, source metadata, sequence coordinates, surface operations and inherited cuts remain unchanged. Each migration stage owns its own count and inherited boundary. Released V3 decoding and validation stay delegated to the preceding package. V3 data containing the reserved `collaboration-peer` source or `requiredAdmissionPolicy` is refused, because historical data cannot acquire new authority requirements retroactively.

Native V4 retains V3 physical framing and validates required admission metadata before recoverable-tail handling. A supplied policy identifier must be a nonempty string. Collaboration sources require exactly `kind`, `requiredAdmissionPolicy`, `senderSessionId`, `recipientSessionId`, `connectionId` and `messageId`; the policy equals `collaboration-peer`, identities are nonempty without control characters, and sender differs from recipient. Validation covers inbox insertions, user messages, personal observation request messages and title request messages. Unknown required event refusal and ignorable-event preservation remain the released-format behavior.

## Model Experience

None, as this library validates persisted requirements without adding model input. Runtime admission belongs to the [Agent owner](../../core/agent/README.md).

#### KV Cache effect

Identity migration preserves existing model records and reusable request prefixes; it introduces no replacement prompt or tool schema.

## Known Limitations and Deferred Work

- The library does not supply a runtime policy or downgrade support. The [format status authority](../../../docs/session-format-status.md) distinguishes the checkout writer from released formats. A current writer requires version-named snapshot successors while every committed predecessor remains unchanged.

**Runtime invariant:** No companion is published. Each stage validates its owned artifact directly and maintains no independent runtime observation.
