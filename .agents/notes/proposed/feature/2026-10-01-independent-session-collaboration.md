# Agent Note: Independent session collaboration

Status: proposed

English | [中文](2026-10-01-independent-session-collaboration.zh.md)

## Problem

Independently created sessions need a persistent discussion connection without changing their workspaces or treating a peer message as a human instruction. The existing authenticated UI transport cannot establish human-only action authorization against a model-owned process running as the same operating-system user. Dynamic Host code also retains access to Host-realm functions. Discussion and action authorization therefore require different guarantees.

## Proposal

Compose an opt-in Host plugin with durable pair connections, human UI controls, explicit peer attribution, and the two model tools `collaboration_status` and `peer_send`. V1a supports discussion only. Task dispatch, claims, execution approvals, review, and integration remain deferred until Prerequisite P provides enforceable human-only action admission. The [design](../../../../docs/superpowers/specs/2026-10-01-independent-session-collaboration-design.md) describes the complete feature; V1a is the discussion-only milestone.

The current policy milestone uses a module-private object capability for discussion controls. Tool JSON and cloned objects cannot recreate it; arbitrary Host code and a same-user authenticated Gateway request are outside that guarantee. The constructor is absent from the package entry and model tool registry. The discussion Remote adapter uses existing authenticated Connection/Gateway transport and creates admission internally. It accepts no JSON capability flags and grants no action authority through that path.

Turn authority belongs to the exact executing Agent. `human` and `peer-discussion` are the only classes. Peer and unknown input make a turn stricter; supported tool/plugin context is neutral. `tools.guard` denies peer action tools after the extensible pre-execute policy. Configuration selects only reviewed `read`, `glob`, `grep`, `collaboration_status`, and `peer_send` names; it cannot admit an arbitrary capability by adding its name. This uses the existing runtime extension points and changes no shared runtime owner.

Peer delivery requires installed collaboration authority before admitting input, including cold recipients. `requireCollaborationAuthority(ctx)` supplies that presence check and is removed with the policy registrations. The delivery/resolver owner preserves ordinary human-only restoration while failing closed for protected peer work. Installed policy classifies unrecognized input conservatively; protected pending input cannot restore without its authority owner.

The durable milestone stores V1a registrations, pairs, outbox messages, budgets, journal entries, and actor-scoped original request receipts in version-1 domain `collaboration`, table `state`, record `current`. `KvTable.update` atomically publishes the entire aggregate and ordered journal after durability; it avoids cross-record ownership and outbox races at the cost of rewriting retained data. Explicit validated capacities stop writes instead of discarding authority or pending work. Task-only schemas remain deferred. A queued message's `activationReserved` fact commits with its budget charge; durable recipient acceptance is a separate `admitted` transition, so disconnect can still cancel reserved queued work without misrepresenting recipient input.

The Remote milestone derives ordinary identity and cwd through stored Session header observations without waking an Agent or reading conversation events. Human display titles are explicit input; ordinary forks and different workspaces are permitted. First connection registers both endpoints and grants their pair in one transaction. Original request intent is checked before new Host-generated identity or metadata, so a retry remains stable across later header changes. Snapshot/follow return only authorized pair records. Complete revision snapshots permit reconnect and gap recovery with one pending view per stream; disposal removes listeners even when a direct consumer has stopped pulling.

## V1a implementation

The discussion-only assembly now lives in the opt-in `@deepseek-ai/dsh-collaboration` bundle, `packages/host/collaboration`, and `packages/client/ui-collaboration`. The Host package's separate `/tool` entry owns the model tools. The authority marker is shared across built Host and tool entries. Delivery checks installed policy and ordinary stored Session identity before cold admission, while human-only restoration remains supported without the optional feature. The model can read status and send peer discussion through explicit attribution; private Session history remains outside collaboration snapshot/follow views. The sidebar uses reversible chat input ownership, dedicated Peer framing, explicit disclosure/grants/budget controls, and pause/resume/disconnect operations.

Session V4 records admitted peer source metadata and receipt identity. The version-3-to-4 migration supplies complete current history and refuses unsupported peer input. Current-writer snapshot refresh creates successor generations beside immutable predecessors; historical owners retain their explicit generations. SDK projections normalize only declared owned cwd spellings, including JSON-escaped Windows policy text. The Python SDK's documented explicit built JavaScript carrier launches through Node without changing executable-carrier behavior.

Actual opt-in Gateway recording, offline replay, stopped-process restart, and Chromium interaction cover independent Session discussion, attribution, write denial, private-history exclusion, durable budget, and human controls. Tasks involving proposals, claims, reviews, integration, and enrollment remain unimplemented behind Prerequisite P. This note remains proposed because the complete proposal includes those deferred action workflows; the V1a discussion milestone is implemented.

## Alternatives considered

**Use UI credentials as action authorization.** The permanent investigation tests show that a same-user shell can authenticate with test-owned local credentials and that a dynamic VM helper can access the Host process. Another ambient token or a hidden method does not distinguish a human from these callers, so it cannot unblock action dispatch.

**Let configuration admit arbitrary tool names.** This permits an ordinary allowlist edit to grant `write` or dynamic execution to peer messages. A reviewed closed set, narrowed by configuration and copied at installation, preserves the discussion-only guarantee.

**Require a global core policy for every restored session.** Ordinary sessions remain supported without this optional feature. Protected recipient discovery and cold peer admission belong to the collaboration delivery owner; modifying the core runtime would impose an unrelated requirement on human-only sessions.

**Persist each grant, message, and budget separately.** The existing storage-domain primitive serializes record updates but does not expose multi-record transactions. Separate writes could commit an outbox without its budget charge or revoke only part of a pair. One aggregate keeps these transitions atomic without adding a database; bounded retention remains an explicit operator cost.

## Acceptance criteria

The policy milestone boots a test-owned `cordis.yml` through real Loader/Include services and uses the production AgentLoop, tool executor, session store, and JSONL backend. It rejects forged discussion admission, unsafe configuration, peer writes, shell/dynamic/delegation/publishing calls, and listener attempts to undo restrictions. Tests verify files and durable logs independently, restore interrupted work, refuse failed resume publication, and await request cancellation during disposal. Permanent same-user Gateway and dynamic VM tests document the current admitted attacks.

The durable milestone verifies stale concurrent writers, failed storage publication, per-pair grants, budget reservation and disconnection, actor-scoped retry results, corrupt records, explicit capacity limits, and disposal. A real Loader composition with the production JSON backend verifies disk state, restart, and plugin remount without replenishing the budget.

The Remote milestone verifies authenticated mutations and streams through a Loader composition with production Connection/Gateway, JSON storage and JSONL Session headers. Unauthenticated calls and forged JSON admission fail. Metadata browsing requires no Agent service. Concurrent retries, stale revisions, pair filtering, queued cancellation with admitted work retained, stream reconnection, and unload/remount are covered. Direct Host execution and same-user authenticated requests remain documented limitations rather than denied attacks.

Completing V1a additionally requires explicit peer-source logging and receipt resolution, absent-policy cold-recipient denial, ordinary human-only restoration, model tools, the Live Signal portal, and a keyless recorded-session scenario through the final opt-in assembly. No shipped default or live session is activated by these test fixtures.

## Risks

Executor policy requires callers to carry the exact Agent. Arbitrary Host code can call services directly or omit that identity; the plugin is not a process sandbox. An installed-policy marker establishes presence, not isolation from Host code. The resolver enforces recipient scoping and the installed-policy check for protected delivery. Existing sandbox, approval, and tool policies continue to apply. Closing Prerequisite P is a separate prerequisite for any future action-authority capability.
