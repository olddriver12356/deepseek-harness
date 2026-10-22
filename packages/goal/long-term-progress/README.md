---
description: "Durable Session-local milestone and checkpoint state, evidence, and revision-bound authority."
---

# Long-term progress

## Contract

`ctx.longTermProgress.get(agent)` reads the registered `longTermProgress` Session projection and returns a detached state or `null` before the first list. `change(agent, { revision }, change, authority)` is the only durable mutation path. Revision zero creates the first list; each successful append increments the revision. Failed validation, stale revisions, corrupt replay, disposed services, and non-live Agent handles reject without publishing a new state. Events carry the complete post-change state and the validated operation; replay recomputes the transition and rejects mismatched settlements. Projection caches are derived, never authoritative.

The structure has exactly two levels: milestones and checkpoints. IDs are stable branded strings, unique across the list. Checkpoints retain immutable evidence settlements; completion requires the latest settlement to contain a passing observation and at least one reference. A failed observation reopens a current checkpoint without removing prior evidence. Accepted milestones cannot be rewritten; a demonstrated historical failure inserts a repair checkpoint into the current milestone at an explicit position. The caller owns the dependency analysis and must ask a human when the safe position is ambiguous.

Human adapters must derive `ProgressAuthority` from their live command, UI action, or direct-human tool interaction. It is a trusted same-process parameter, not a wire/model argument. Replacement, approval, release (`start`), acceptance, document references, and vault linking require human authority. Approval does not release. Release records scope permission only: no method starts, resumes, queues, injects, or arms execution. Acceptance requires nonempty evidence-complete checkpoints and approval, clears release and Goal binding, and never releases the next milestone. Structural replacement revokes approvals, release, and Goal binding. Refinement can change only implementation detail and references, never the checkable outcome.

`eligibleCheckpoints` in the source domain module checks a nonempty consecutive unfinished prefix in the current released milestone. Goal adapters must combine that scope check with their process-local activation, cancellation, and direct-human policies. A Goal phase cannot settle progress. The `bind-goal` operation records an eligible association but does not create a Goal.

## Configuration

All bounds are positive safe integers: `maxMilestones` defaults to 64; `maxCheckpoints` to 256 per milestone; `maxTextLength` to 4096 UTF-16 code units per text field; `maxReferences` to 64 per collection; `maxHistory` to 1024 per other retained collection. Admission checks the complete operation and next state, rejecting oversized lists rather than dropping captions. Replay validates historical data independently of current deployment admission limits.

## Persistence and lifecycle

`progress/change` version 1 is a required-on-read Session event. The service registers its pure projection through the existing Session projection registry. Forks retain inherited progress and references, suspend child vault writeback, and clear inherited Goal bindings without modifying the parent. Renewed human `vault-link` confirmation is required before child settlements. Reload restores durable scope decisions but cannot activate execution because this package has no execution integration. All registrations are owned by the plugin fiber; retained handles reject mutation after disposal.

Vault metadata settlements are not filesystem writes. The adapter must validate current contents, compare the approved fingerprint immediately before writing, preserve stable marker mappings and unrelated content, and report pending, failed, or conflicting synchronization instead of claiming atomic Session/filesystem success. Checkbox permission does not grant text-refinement permission.

## Model Experience

This package registers no model tools or reminder input, consumes no model tokens, and does not affect the request KV cache. Consumers must log every model-visible reminder and retrieve details selectively. Saving progress never generates an execution plan or execution authority.

## Known Limitations and Deferred Work

Command, tool, reminder, Goal advancement, filesystem/vault, and UI consumers are separate adapters. They must not pass model-supplied authority or silently execute saved scope. Product composition, both SDK acknowledgements, Session compatibility acknowledgements and catalog regeneration, recorded-session snapshots, package classification, and final integration validation are owned by the integration task. The package does not provide a scheduler, evaluator, workspace database, or global progress page.
