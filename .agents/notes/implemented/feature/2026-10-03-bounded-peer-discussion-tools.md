# Agent Note: Bounded independent-peer discussion tools

Status: implemented

English | [中文](2026-10-03-bounded-peer-discussion-tools.zh.md)

## Problem

Human-authorized connections need explicit model discussion without sharing private conversations or granting peer execution authority. Durable acceptance and later recipient admission are different facts; reporting a send as a reply would hide queued, cancelled, or failed work.

## Decision

The [collaboration package](../../../../packages/host/collaboration/README.md#model-discussion-tools) exposes a separate optional `./tool` plugin. It registers only `collaboration_status` and `peer_send` through existing tool effects, plus instructions through the system-prompt registry. The loop logs actual instructions, calls, and results. Peer execution still requires the explicit authority allowlist; its file-read default stays unchanged.

Both tools derive identity from the exact live ordinary executing Agent. Status reuses the Remote's committed snapshot filtering. Sending delegates strict connection/text/request-key validation, durable acceptance, framing bounds, and actor-scoped retries to the existing mailbox. The original queued receipt remains stable after later admission or settlement; status reports current delivery and never completion. Optional task associations and action tools are absent.

## Alternatives considered

**Install tools with every collaboration service.** That would add schemas and instructions to service-only assemblies and couple an explicit model capability to human controls. The optional entry keeps installation deliberate.

**Build a second status filter or receipt cache.** That risks disagreement with committed grants and original retries. The existing Remote and mailbox already own those facts.

## Consequences

Loader composition tests cover strict execution, exact identity, filtered grants, receipt stability, all delivery states, native and direct guard paths, logged model input/output, and effect disposal. An owner-local snapshot pins actual assembled instructions and schemas. A scenario patch supplies the supported profile contribution; the final assembled recorded Session and SDK expectations remain integration work. Arbitrary Host code and same-user Gateway credentials remain the documented Prerequisite P limitation. No new persistence schema or action authority is introduced.
