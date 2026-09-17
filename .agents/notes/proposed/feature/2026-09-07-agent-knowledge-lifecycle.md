# Agent Note: Agent Knowledge lifecycle

Status: proposed

English | [中文](2026-09-07-agent-knowledge-lifecycle.zh.md)

## Problem

DSH conversations contain useful evidence, but saving a conversation is not equivalent to verified knowledge or permission to publish it into the owner's Vault.

## Proposal

Keep DSH material inside Agents. Capture committed conversation records and cleaned News summaries deterministically in Intake. Explicit AI processing creates separate Processed cards while preserving source evidence. Expose Intake, Processed, and Knowledge · To learn as primary tabs; Methods retains its separate execution controls. Direct concept questions enter unreviewed, unlearned Knowledge without an Intake copy. Owner acceptance, learning, and publication outside Agents are separate decisions.

The implementation in [host Knowledge](../../../../packages/host/knowledge/README.md) and [client Knowledge](../../../../packages/client/ui-knowledge/README.md) supports capture, isolated tool-free processing, retained failed attempts and retry, revision-bound review and learning, shelving, and separately approved publication. Publication creates new files only; later versions require a new filename and renewed approval rather than overwriting owner edits. Source evidence stays intact. The local Host is activated; full owner acceptance of real-model processing and final publication remains open.

## Alternatives considered

The reader follows Boujoy's direct card-to-modal interaction, black header, and mobile bottom sheet while retaining Vault operations below the body. The owner requested a dark charcoal reading surface instead of the original cream, with corresponding text and control contrast. Loading and read failures remain visible. Source and derived-item navigation uses canonical `derivedFrom` identities and a local Back stack. The existing safe Markdown primitive renders output and conversation text without executing source HTML; raw output and complete evidence remain collapsed so storage syntax does not dominate reading. This presentation makes no model request and does not alter stored evidence or approval requirements.

**Direct agent publication:** rejected because generated material could enter the owner's curated knowledge without approval.

**One moving source package:** rejected for conversation capture because distillation must not replace the original evidence.

## Acceptance criteria

News cards expose an explicit distillation action that captures feed evidence before calling isolated processing. Loading prevents repeated clicks and failure remains retryable. Optional Knowledge access uses the Cordis service lookup so its absence cannot crash the News overlay. Application typography uses the usage-stats plugin's filter baseline of 14px across authored CSS, shared text tokens, and chart labels; larger text keeps its hierarchy. A CSS audit script and browser computed-style checks verify the minimum without a mutation observer or runtime text-resizing loop. Installed plugin controls need scoped theme overrides because their styles are outside the authored app tree.

Capture preserves complete committed records without an AI call and deduplicates identical evidence. Processing has durable progress, failure, and retry state and receives no tools, workspace instructions, Memory, MCP, or agent assembly. Structured output and suggested existing directories are validated. Review uses minimal status flags and current revisions, not legacy validation receipts. Publication requires learned Knowledge, a destination/content preview, and explicit approval. Tests cover the composed Host with a fake model, safe paths, shared writes, source fidelity, and UI errors; real-model output quality and owner publication acceptance remain manual checks.

## Risks

The capture slice preserves attachment references, not their bytes. The conversation projection shows committed user and assistant text rather than replaying tools or injected context; complete evidence is loaded only on request. Canonical artifacts own lifecycle status, not a parallel UI database. Cleaning external text cannot prove absence of prompt injection; source text remains data after review. Multi-card writes are not an atomic transaction and may leave partial unreviewed output after failure. Interrupted publication may leave a partial new note; retries refuse overwrite. Existing News files under Resources are not relocated.
