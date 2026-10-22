---
description: "Durable Session-local milestone and checkpoint state, evidence, and revision-bound authority."
---

# Long-term progress

## Contract

`ctx.longTermProgress.get(agent)` reads the registered `longTermProgress` Session projection and returns a detached state or `null` before the first list. `change(agent, { revision }, change, authority)` is the only durable mutation path. Revision zero creates the first list; each successful append increments the revision. Failed validation, stale revisions, disposed services, and non-live Agent handles reject without appending. Events carry the complete post-change state and validated operation; replay recomputes the transition and rejects mismatched settlements. A replay failure blocks host reads and mutations instead of authorizing work from stale state.

The structure has exactly two levels: milestones and checkpoints. IDs are stable branded strings, unique across the list. Checkpoints retain immutable evidence settlements, including across human-confirmed moves between milestones. An evidenced outcome requires a new checkpoint ID when its condition changes. Completion requires the latest settlement to contain a passing observation and at least one reference. A failed observation reopens a current checkpoint without removing prior evidence. Accepted milestones cannot be rewritten; a demonstrated historical failure inserts a repair checkpoint into the current milestone at an explicit position. The caller owns the dependency analysis and must ask a human when the safe position is ambiguous.

Human adapters must derive `ProgressAuthority` from their live command, UI action, or direct-human tool interaction. It is a trusted same-process parameter, not a wire/model argument. Replacement, approval, release (`start`), acceptance, document references, and vault linking require human authority. Approval does not release. Release records scope permission only: no method starts, resumes, queues, injects, or arms execution. Acceptance requires nonempty evidence-complete checkpoints and earlier approval, clears release and Goal binding, and never releases the next milestone. Structural replacement revokes unaccepted milestone approvals, release, and Goal binding; accepted milestones retain their historical approval evidence. Refinement requires a concrete `reason` persisted with the operation and can change only implementation detail and references, never the checkable outcome.

`eligibleCheckpoints` in the source domain module checks a nonempty consecutive unfinished prefix in the current released milestone. Goal adapters must combine that scope check with their process-local activation, cancellation, and direct-human policies. A Goal phase cannot settle progress. The `bind-goal` operation records an eligible association but does not create a Goal.

## Configuration

All bounds are positive safe integers: `maxMilestones` defaults to 64; `maxCheckpoints` to 256 per milestone; `maxTextLength` to 4096 UTF-16 code units per content field; `maxReferences` to 64 per collection; `maxHistory` to 1024 per other retained collection. Content includes captions, outcomes, implementation details, reasons, evidence summaries, references, and vault text, not fixed protocol literals or stable IDs. IDs retain their separate 128-code-unit protocol bound. Admission checks the complete incoming operation and next state, rejecting oversized lists rather than dropping captions. Prior state and replay validate durable invariants independently of deployment limits, so an existing oversized list can be replaced with content within reduced limits; operations that leave an oversized result still reject.

## Persistence and lifecycle

`progress/change` version 1 is a required-on-read Session event. The service registers its pure projection through the existing Session projection registry with `stateVersion: 2`. Its cache schema validates unique identities, evidence/completion and committed-revision consistency, approval/release/acceptance relationships, released Goal scope, and agreement between inherited replay and suspended child state. Invalid cache rows cannot supply authority: `hydrate`/`restore` reject them, while checkpoint-only reads omit the key. The restoring owner must report the failure and explicitly rebuild from the Session log rather than accepting or repairing cache-granted release. Forks retain inherited progress and references, suspend child vault writeback, and clear inherited Goal bindings without modifying the parent. Renewed human `vault-link` confirmation is required before child settlements. Reload restores durable scope decisions but cannot activate execution because this package has no execution integration. All registrations are owned by the plugin fiber; retained handles reject mutation after disposal.

The wire value is `ProgressProjectionView`: `{ status: 'ready', current }` before and after list creation, or `{ status: 'untrusted', current, failure }` after replay corruption. In an untrusted value, `current` is last-good display data only. The persistent failure supplies `code: 'PROGRESS_REPLAY_FAILED'`, `eventSeq`, and a diagnostic `message`; snapshots, change-feed notifications, and cached reads retain it. Host reads and mutations throw `ProgressError` with that code. Consumers must stop dependent work, localize an actionable corruption report, and have the restoring owner inspect the Session log before rebuilding; later events do not clear the failure or make last-good scope authoritative.

Vault metadata settlements are not filesystem writes. The adapter must validate current contents, compare the approved fingerprint immediately before writing, preserve stable marker mappings and unrelated content, and report pending, failed, or conflicting synchronization instead of claiming atomic Session/filesystem success. Checkbox permission does not grant text-refinement permission.

## Model Experience

This package registers no model tools or reminder input, consumes no model tokens, and does not affect the request KV cache. Consumers must log every model-visible reminder and retrieve details selectively. Saving progress never generates an execution plan or execution authority.

## Known Limitations and Deferred Work

Command, tool, reminder, Goal advancement, filesystem/vault, and UI consumers are separate adapters. They must not pass model-supplied authority or silently execute saved scope. Product composition, both SDK acknowledgements, Session compatibility acknowledgements and catalog regeneration, recorded-session snapshots, package classification, and final integration validation are owned by the integration task. The package does not provide a scheduler, evaluator, workspace database, or global progress page.
