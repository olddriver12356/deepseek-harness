# Agent Note: Bok Personal Core integration

Status: implemented

English | [中文](2026-09-18-bok-personal-core.zh.md)

## Problem

The owner requested Bok's complete About me feature in DSH, including the original visual design and personal-memory operations rather than a second implementation of its state machine.

## Decision

An optional native session-event observer processes newly completed human text turns in a bounded background queue. It logs exact auxiliary model requests, validates literal evidence through the original Bok signal contract, and preserves original learning and review policies. The owner can persistently pause observation. It never backfills history or grants shared Vault publication.

The owner-approved Vault connection adds a guarded projection directory under Semantic rather than moving Personal Core or replacing Profile.md. Original claim services remain authoritative; the adapter retains per-record baselines privately, requires explicit publication/correction, and reconciles revoked projections. Source IDs prevent projected records from becoming independent observations. Runtime state and edited-note recovery remain outside the shared Vault and outside Bok's own backup contract.

The opt-in `ui-personal` package embeds the pinned upstream page and Python engine. A DSH slot wrapper retains the page between navigation changes; the original five views and dialogs remain intact. The authenticated Host route forwards only Personal Core browser operations. Four tools call the same engine with a scoped, revocable DSH Agent credential. The private root stays outside both the project Vault and Git. Existing histories are not imported.

## Constraints

The quick-note button uses the existing global overlay slot and embeds Bok's original note sheet without a navigation page. Explicit owner capture targets `Ideas/Draft` in `ideasVaultRoot`, not the private Personal Core or Agent Knowledge. The original text is preserved instead of generating a seed definition. The existing Vault guard, authenticated route, UUID validation, atomic no-overwrite file creation, and content-bound retry check protect this write path. Draft IDs survive failed requests and refreshes; the original 24-hour browser draft expiry remains.

The adapter requires Python and a Web server. The original page remains Chinese. Reusing the engine preserves confirmation, separate authorization, evidence aggregation, correction history, feedback, backups and destructive-forget confirmation, at the cost of an isolated page and a local process. The pinned license notices and modified-file attribution ship with the package. Automatic whole-history capture and silent prompt injection are outside this change.

## Verification

The Loader composition test exercises authentication, route isolation, real private storage, protected-claim review and authorization, all four tools, correction, backup, confirmed forgetting, credential revocation and plugin disposal. It records the model-visible privacy acknowledgement. Browser checks exercise all five views, panel switching and narrow layout. The Host and Client faces typecheck separately. Upstream personal-memory tests cover the reused state machine; the Windows environment cannot run the one case that creates a symlink without the required OS privilege.

## Alternatives considered

Reimplementing Personal Core would duplicate its review and credential rules. Requiring every agent to call observation tools leaves automatic collection dependent on agent behavior. Native session events provide the existing extension point without modifying the agent loop. Historical backfill is outside the requested monitoring scope.

## Consequences

Eligible new text turns incur one bounded auxiliary model request. The queue is transient and skips overflow. Pause is persistent, while protected claims and shared publication retain separate owner gates.
