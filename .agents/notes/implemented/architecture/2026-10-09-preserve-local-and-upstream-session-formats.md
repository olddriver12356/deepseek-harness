# Agent Note: Preserve local and upstream Session formats

Status: implemented

## Problem

The pre-integration local writer and upstream dsh-v0.1.7-alpha.1 both use Session format 4 for incompatible representations. Local V4 retains V3 tool-result wrappers and required input admission metadata. Upstream V4 introduces tool-role results, developer messages, producer-owned source kinds and revised child relationships. Choosing either representation globally would reject or reinterpret files written by the other writer.

## Decision

The integrated writer publishes V5 successors through the existing JSONL migration transaction and retains every predecessor. Native upstream V4 follows the ordinary adjacent migration. Exact Session identities explicitly configured in `session-persistence-jsonl.localV4SessionIds` select the local V4 decoder and conversion. The conversion reuses the upstream V3 transformation, preserves local Experts and Personal events, validates required admission attribution before recoverable-tail handling, and retains historical delivery coordinates. Existing extension points cannot distinguish two physical dialects sharing the same version header, so the catalog and persistence owner carry this small explicit selection.

The native upstream V4 schema remains a bilingual historical reference. Locally authored migration rationale and package documentation remain English only. Generated subsystem references honor the existing precise translation exclusions; missing required upstream translations still fail generation. Workspace builds discover package manifests so ignored build output from removed packages cannot become build inputs.

## Alternatives considered

**Overwrite the local V4 implementation with upstream V4.** This loses required-admission validation and prevents restoration of local records that use the older message representation.

**Keep the local V4 representation as the current writer.** This discards upstream functionality and would reinterpret native upstream V4 files.

**Infer the dialect from event contents or retry another decoder after failure.** Empty Sessions, opaque extensions and malformed records make inference ambiguous. Decoder failure is validation evidence, not permission to reinterpret the source.

## Consequences

Operators must inventory the exact local V4 Session identities before activation. No production migration is implicit in integration testing. Unknown required events and malformed policy attribution remain refused. Every future upstream update must preserve the V5 writer and verify both V4 readers, parent-child evidence, delivery coordinates and peer authority. Released V3-to-V4 tests use a V4 catalog while independently validating the resulting native messages through the current installed Session runtime; V4-to-V5 tests cover the integration edge.

Host and Client composition tests, shipped Web verification and normal commit gates remain required. A clean textual merge does not establish that local features survived changes to Settings, child projections, messages or slots.
