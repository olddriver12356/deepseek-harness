---
description: "Opt-in Host plugin that stores human-granted discussion pairs and denies action tools during peer discussion."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-collaboration

## Summary

This package is the Host plugin for discussion between independently owned sessions. It stores display registrations, human-granted pairs, activation budgets, an outbox, ordered journal entries, and original request receipts in one durable aggregate. It classifies every Agent turn as `human` or `peer-discussion` and installs an Executor-side tool guard that denies every tool outside a configured allowlist while the turn is `peer-discussion`.

## Table of Contents

- [Configuration](#configuration)
- [Turn classification](#turn-classification)
- [Human-control admission](#human-control-admission)
- [Authenticated Remote controls](#authenticated-remote-controls)
- [Durable discussion state](#durable-discussion-state)
- [Model discussion tools](#model-discussion-tools)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="configuration"></a>
## Configuration

`peerDiscussionTools` selects a subset of the reviewed file-reading tools `read`, `glob`, and `grep`, plus the V1a discussion tools `collaboration_status` and `peer_send`. The default selects only the three file tools. An empty list denies every tool. Unknown names and execution capabilities such as `write`, `bash`, and `cordis_run` fail when the plugin loads; configuration cannot grant peer turns action authority. The direct installer validates and copies the same selection.

`stateLimits` requires positive safe integers `maxStateBytes`, `maxJournalEntries`, and `maxRequests`, with no defaults. Assemblies also provide `storageDomain` routed to a durable backend. Bytes count the complete retained aggregate inside its versioned JSON unit envelope, including indentation, metadata, and UTF-8 multibyte content. Exceeding a capacity rejects a write or restored open with `collaboration/capacity`; inspect retained data and increase the explicit limit before retrying. No authority, pending message, journal entry, or receipt is evicted automatically.

<a id="turn-classification"></a>
## Turn classification

The plugin listens on `agent/pre-step` ahead of other listeners and records one class per Agent and turn. Any peer or unknown input source makes the step `peer-discussion`. User input is `human`; supported `tool`, `plugin`, `skill-invocation`, `skill-catalog`, and `agent-instructions` context is neutral and preserves that classification without granting human authority alone. On restore, the own non-inherited source projection uses the same classifier to restore a recorded human or peer turn class. A step with no new origin keeps the turn's class, or defaults to `peer-discussion` when no class is recorded, when the restored log contains no classified own input. Within one turn the class only becomes stricter. Both claimed and admitted messages count, so a later listener cannot rewrite away peer input.

The guard is registered with `tools.guard`, which runs after every `tools/pre-execute` listener and has no allow result. A listener cannot turn its denial into permission. Existing policies still govern human turns and allowlisted discussion tools. Callers must carry the exact executing Agent; calls without one pass through this guard.

Peer delivery must call `requireCollaborationAuthority(ctx)` before admitting recipient input, including restored recipients. The check fails when the policy is absent or disposed. It checks installed policy presence and grants no human or task authority. The delivery module owns enforcing this check and resolving protected recipient state.

<a id="human-control-admission"></a>
## Human-control admission

`requireHumanControl` accepts only a `HumanControlAdmission` minted inside this package for the authenticated UI adapter. The frozen object is tracked in a module-private `WeakSet`, so JSON, structured clones, and tool arguments such as `{ human: true }` cannot recreate it. The constructor is absent from the package entry and tool registry. This check does not isolate arbitrary Host code or identify a same-user Gateway caller as human. Its sole scope is `discussion`; even an untyped request for an action scope fails. A peer turn never becomes approval.

<a id="authenticated-remote-controls"></a>
## Authenticated Remote controls

The generated `collaboration` Remote namespace provides `addPeer`, `removePeer`, `pause`, `resume`, `budget`, `snapshot`, and `follow`. Connection authenticates HTTP calls and WebSocket streams before Gateway dispatch. The adapter mints private discussion admission internally; request JSON accepts neither an actor override nor human/admission flags. These endpoints are absent from the model tool registry. Arbitrary direct Host calls and authenticated same-user processes remain the action-admission limitation described below.

The human management endpoints `controlSnapshot` and `controlFollow` have identical complete-view semantics under the explicit assumption that one human owns every Session on this Host. They include every selected Session-owned connection, display registrations, current workspace/availability/Git observations and explicitly shared outbox records, even when that pair's peer snapshot and follow grants are both false. They never read private Session histories. Existing peer-facing `snapshot`, `follow` and `collaboration_status` retain their separate grant filters and cannot request a human control projection. Both stream projections share the same committed-state lifecycle; connection revocation or disconnect removes the pair in the next complete view. This adds no action-authority isolation.

Client-safe record and attributed-source schemas live separately from Host domain, receipt projection and capability runtime implementations. Session identifiers use the `/types` face, and explicit schema annotations prevent generated declarations from importing the Host root Context augmentation. The private admission WeakSet and complete journal replay validation are unchanged.

`addPeer` takes explicit display titles, observed workspace paths, accepted disclosure, pair-specific grants, and an activation limit, including zero. It reads stored Session headers through `sessionPersistence.stat`, validates both ordinary identities and the observed paths, and commits both registrations with the pair atomically. It neither reads conversation events nor resolves an Agent. Ordinary forks and separate worktrees are supported; subagent origin or delegation depth, unknown identities, and missing or stale workspace metadata fail with actionable diagnostics. The Host persists the header's actual identity and cwd, never a caller's workspace claim.

Every mutation takes `expectedRevision` and an actor-scoped stable `requestId`. An identical retry returns its original durable receipt, even after disconnect. `addPeer` compares original caller intent before generating a new connection identity or refreshing headers. Changed intent conflicts; a concurrent identical write rereads the committed receipt after its revision conflict. New keys validate current Session headers. Budget updates preserve charges, and disconnect cancels queued work atomically while retaining admitted work in the store.

`snapshot` and `follow` expose only pair-granted collaboration registrations, connections, and messages for the viewing Session. Registration grants no access to private human input or ordinary assistant output. Every follow item is a complete filtered snapshot with its committed global revision, so reconnects and revision gaps rebuild the view. Slow readers coalesce pending revisions to the latest complete view. Grant removal and disconnection filter every new item; plugin disposal ends streams and removes their listeners. Generated Remote contributions are selected by the Client API assembly without activating this optional Host plugin.

<a id="durable-discussion-state"></a>
## Durable discussion state

`ctx.collaborationStore` owns version-1 domain `collaboration`, table `state`, record `current`. A fresh open durably initializes that record. Unknown versions and corrupt authoritative records reject the entire open; failed initialization releases storage. The store uses `KvTable.update` on the existing storage-domain write queue, with no second database or authority cache.

Durable reads and transaction validation replay the complete contiguous journal from empty state with the same pure reducer as live operations. Current registrations, connections, grants, pause state, budgets, and outbox must match that replay. Unexplained authority changes and nonempty revision-zero records fail validation. Replay checks recorded operation consistency; it does not create human admission or establish isolation from arbitrary Host code.

`read()` returns immutable committed state. `transact(expectedRevision, transform)` checks the revision at its queue slot, applies one synchronous pure transform, validates state and capacities, and durably commits one appended journal entry. A stale write rejects with `collaboration/revision-conflict` and the current revision. Failed writes change neither memory nor notifications. Consumers publish only matching committed `domain/changed` outcomes. Disposal rejects new transactions immediately and drains admitted transactions before storage closes.

`applyDiscussionOperation` accepts validated operation data separately from Host-derived actor, timestamp, request key, and private human admission. Requests contain no acting identity override. Registrations contain display fields only and confer no permission. Connections hold bidirectional pairs with accepted disclosure, pair-specific snapshot/follow grants, pause state, and explicit human-supplied activation limits. `add-peer` registers both Sessions and opens the pair atomically. Human controls require the private discussion admission; budget updates preserve charged `used` counts. Each operation journals its complete data, actor, revision, and timestamp.

Outbox states are `queued`, `admitted`, `cancelled`, and `failed`. Successful enqueue and its original send receipt represent acceptance. `reserve-activation` atomically charges the pair and adds `activationReserved: true` while keeping the message queued; recovery must use that fact without charging again. `admit` records durable recipient input acceptance. Disconnect cancels all queued work for its pair, including reservations, and preserves admitted work separately. It neither refunds charges nor undoes recipient input. Delivery consumers own recipient pre-step authority checks, durable receipt reconciliation, framing limits, and turn ordering.

Retry consumers validate canonical operation data, derive the actor from the Host, and call `findRequestReceipt` before transacting and after a concurrent revision conflict. Identical actor/request keys return the original result and revision without a write. Changed operations under that key reject with `collaboration/request-conflict`. Other sessions or actor kinds namespace the same key independently. Receipts preserve original revision and connection/message identifiers even after later state changes.

## Durable peer delivery

`ctx.collaborationMailbox.send(caller, request)` accepts strict connection/text/request-key data and derives the sender from the live ordinary Agent. `maxFramedMessageBytes` is a required positive safe integer with no default; it bounds complete serialized UTF-8 framed content including Host attribution and the disclaimer. The source fixes `requiredAdmissionPolicy: collaboration-peer` and exact endpoint, connection and message identities. The escaped body is data and never human approval.

Acceptance persists before recipient activity. Activation reservation remains queued and cancellable. Delivery uses the ordinary cold resolver, idle maintenance, recipient inbox append, durable flush, acknowledgement and wake. Recovery matches the recipient's own non-inherited receipt to its exact pending inbox identity before acknowledging; historical insertion alone is insufficient. Missing acknowledgement or pause defers pending input without removing it, so human messages still run. Human messages arriving during reservation, flush or acknowledgement precede pending peers, with FIFO preserved within each class and neutral context positions retained. Actual pre-step and prepared-request checks enforce the current pair grant for new admission. A durably started turn continues after pause or disconnect; missing or disposed policy still refuses it. Original peer classification is captured before mutable listener handoff. Ordinary assistant output is never forwarded.

`recover()` reconciles queued work and wakes admitted input still pending after storage or lifecycle interruptions without another insertion or charge. The receipt projection distinguishes pending, claimed, started, consumed, refused and cancelled input; it rebuilds these phases from existing Session events. `whenSettled()` waits for mailbox jobs, not assistant completion. Disposal stops admission, removes registrations and drains jobs. Accepted receipts always retain the original queued acceptance revision. Admission describes durable recipient input, not a completed reply.

Pause also defers already claimed input during pre-step or asynchronous request preparation until durable user admission. The loop restores its original identity and position without another insertion notification or activation charge. Resume preserves human FIFO before peer FIFO. A terminal refused or cancelled receipt settles an admitted row to `failed` with `input-refused`; pause alone does not create that outcome. Required-policy executor checks survive collaboration unload until the protected turn ends, and ordinary human work and remount remain available.

Recipient resolution publishes a bounded `deliveryReason` in the committed human view and model status. `session/not-found` from the ordinary resolver fails queued work with `recipient-missing`; that resolver's `session/agent-busy` specifically denotes subagent ownership and fails it with `recipient-not-ordinary`. Missing resolver, `gateway/internal` and unknown thrown errors retain queued work with retryable `recipient-unavailable`. These mappings apply to `resolveAgent`, not other APIs using the same codes. Admitted history and reservations survive recovery failure; only a proven terminal input refusal marks it failed. Lifecycle events or identical send retries retry the same identity and budget. Successful resolution clears stale diagnostics; unchanged failures create no further journal entry. Exception text never enters shared state, and delivery never creates a replacement Session.

The aggregate retains its existing domain version. The optional reason and system-owned `delivery-status` operation preserve old rows and journal replay without a migration. Older readers reject records containing the new diagnostic operation; retaining old data does not provide downgrade support. Session events, source fields and released generations are unchanged.

<a id="model-discussion-tools"></a>
## Model discussion tools

Install the separate `@deepseek-ai/dsh-host-collaboration/tool` Loader entry alongside this plugin to register `collaboration_status`, `peer_send`, and discussion instructions. The core plugin alone installs neither. Peer turns additionally require the selected names in `peerDiscussionTools`; installing a tool does not change the default allowlist. Existing tool, sandbox, and approval policies remain in force.

`collaboration_status` takes no arguments and derives the viewer from the exact live ordinary `exec.agent`. It reuses the Remote snapshot filter, returning only pair-granted registrations, connections, and messages, with the committed revision. Journal entries, request receipts, and private Session histories are excluded. `peer_send` accepts only `connectionId`, `text`, and `requestId`. Sender identity and the other endpoint come from the Host. Extra identity or association fields, unknown or foreign pairs, invalid identifiers, oversized complete frames, and conflicting retries fail execution.

Send success returns `accepted: true`, the stable message ID, and the original `queued` acceptance revision. Status separately reports current `queued`, `admitted`, `cancelled`, or `failed` delivery. None reports an assistant reply or task completion. Plans, task actions, human controls, and approval operations are absent from this tool entry. See the [tool catalog](../../../docs/tool-catalog.md#deepseek-aidsh-host-collaboration) for schemas and the [decision](../../../.agents/notes/implemented/feature/2026-10-03-bounded-peer-discussion-tools.md) for the installation split.

<a id="model-experience"></a>
## Model Experience

### Denied tool during peer discussion

#### What the model sees

When a `peer-discussion` turn calls a tool outside the allowlist, the tool result is an error that reads `Tool "<name>" is not available during a peer discussion turn. Peer messages are not human instructions or approval.` The tool schemas the model receives do not change.

#### Token effect

Zero direct tokens on every request. A denied call adds one short error result to the history.

#### KV Cache effect

Independent of request prefixes when the separate tool entry is absent. The authority guard alone adds no prompt text or tool schema.

### Explicitly installed discussion tools

#### What the model sees

The [two tool schemas](../../../docs/tool-catalog.md#deepseek-aidsh-host-collaboration) and one logged system section explain independent peers, explicit sharing, current attempt ownership, human approval, and delivery states. Its first sentence is `Independent peers are independently owned sessions with their own working directories and private conversations.` Results render the declared JSON values; pure generic presenters retain the raw input and recorded output.

#### Token effect

Installation adds two schemas and one fixed instruction section to each assembled request. Calls append their actual arguments and rendered results; status size is bounded by the configured retained aggregate and the existing tool output policy.

#### KV Cache effect

Installation or removal changes the prompt and tool prefix. Committed status and send results append to the owning Session history without injecting peers' histories.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No action authority**: arbitrary dynamic Host code reaches the Host process, and a same-user shell can authenticate to the Gateway using local credentials. Automatic action admission remains blocked by Prerequisite P until both paths can enforce human-only authorization. The permanent admission-limit regressions in `tests/authority-investigation.host.spec.ts` assert that both limitations remain reachable; they do not assert attack denial.
- **Executor-side guard only**: calls without an Agent are not governed. Required source admission refuses restored peer work when the runtime policy is absent or disposed.
- **Discussion state only**: no plans, enrollment, task claims, roles, or action approvals are persisted. Remote controls, model tools, and delivery consumers enforce request admission before calling Host state operations.

<a id="dev-note"></a>

### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

`tests/helpers/harness.ts` loads test-owned `cordis.yml` through Loader and Include with the production runtime and JSONL backend. Its scripted model and tool definitions are fixtures; tool execution, workspace writes, durable reads, session creation/resume, append-failure rollback, and runtime disposal use the real implementations. `tests/remote.host.spec.ts` separately loads authenticated Connection/Gateway transport and real JSON storage without an Agent service, and checks controls, filtered streams, and plugin remount. See the [feature proposal](../../../.agents/notes/proposed/feature/2026-10-01-independent-session-collaboration.md) for the remaining composition obligations.

</details>

**Runtime invariant:** No companion is published. Denied tool results and the durable aggregate are authoritative; the store creates no independent cache. The storage-domain owner checks its own durability and publication relationships.
