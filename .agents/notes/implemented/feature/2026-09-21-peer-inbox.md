# Agent Note: Opt-in owner relay Peer Inbox

Status: implemented

English | [中文](2026-09-21-peer-inbox.zh.md)

## Problem

A trusted owner relay needs bounded access to an already live root Session without gaining Session creation, permission mutation, browser exposure or remote approval capabilities. A follow-up does not have a per-message completion promise, and retries after lost responses can duplicate owner work.

## Decision

`packages/host/peer-inbox` owns a separate authenticated IPv4 loopback listener and a durable request ledger. Explicit allowed Session IDs are checked against the live root registry. The plugin submits user-role messages with plugin source through `followup`, matches their exact inbox claim to a turn, and settles only that turn's final Assistant text after `turn/end`. Foreign input suppresses potentially unrelated output. It never uses whole-agent idle as causal evidence.

The request tombstone is fsynced before dispatch. Fingerprints bind request ID to runtime, Session and text. Capacity exhaustion rejects new work rather than forgetting old IDs. Atomic file publication follows the JSON storage implementation, while an exclusive lock prevents concurrent writers and intentionally requires operator recovery after a crash. Restarted pending entries become unknown; the plugin does not resubmit. A Session's original durable inbox can still execute later if resumed without this plugin, so unknown is not cancellation.

Timeout and disposal remove only the plugin's own pending message when possible; running work is not cancelled. Complete result JSON, input JSON, HTTP concurrency, pending work and lifetime ledger size have explicit bounds. Windows private ACL provisioning remains an operator prerequisite and no permission mutation is attempted.

## Alternatives considered

- Web-server routes would inherit browser-facing exposure and deployment coupling; a private loopback listener keeps this opt-in transport separate.
- Global `whenIdle()` attribution mixes owner and relay work; exact message claim and turn settlement provide narrower evidence.
- An evicting in-memory cache allows duplicate execution after eviction/reload; bounded durable tombstones fail closed instead.
- Shared generic storage provides atomic replacement but not this exclusive writer/stale-lock policy; the small package-local writer follows the existing storage publication convention.
- Cancelling the Agent on timeout would interrupt work the relay does not own.

## Consequences

The MVP exposes no Slack SDK, UI, approval operation, cold resume or automatic replay. A full ledger and a crash-stale writer lock need operator attention. Output still reflects prior Session context; exact-turn attribution is not an information-flow sandbox. Opt-in configuration and secrets must stay out of shipped profiles.

## Verification

Package tests exercise authenticated HTTP, hostile input, duplicates, durable restart state, bounded queues, cancellation/disposal, exact-turn output and foreign-input suppression. A Loader `cordis.yml` composition with a fake LLM verifies model-visible plugin input and pins the assembled transcript. The external relay integration runs only with explicit `DSH_RELAY_SOURCE` and uses local HTTP and a fake model. A dedicated top-level recorded-session transport adapter remains deferred; the package-local transcript is not claimed as that missing tier.
