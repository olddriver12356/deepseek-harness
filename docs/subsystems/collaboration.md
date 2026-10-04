# Independent Session Collaboration

English | [中文](collaboration.zh.md)

The opt-in [Host package](../../packages/host/collaboration/README.md) owns V1a free discussion between independently owned ordinary Sessions on one Host. The [bundle](../../packages/bundle/collaboration/README.md) mounts the Host, peer-message tool, and sidebar Client together. Installation alone creates no registrations or grants.

## Human controls and views

The authenticated UI supplies `AddPeerRequest`: initiating and peer Session identities, display titles, observed workspace paths, disclosure acceptance, explicit snapshot/follow grants, activation allowance, expected revision, and actor-scoped retry key. The Host checks stored identity and workspace metadata, derives the human actor, and supplies a non-JSON admission capability. Workspaces may differ. `PeerControlRequest` identifies an existing pair for pause, resume, or removal; `PeerBudgetRequest` replaces its total allowance without resetting already charged activations.

`CollaborationMutationResult` retains the committed revision and applicable connection/message identifiers. An identical actor-scoped retry returns its original result; changed intent under the same key is rejected. `CollaborationViewRequest` identifies the viewing Session. `CollaborationSnapshot` contains the global revision and grant-filtered registrations, connections, and outbox messages. Each follow item replaces the complete view. `CollaborationControlSnapshot` additionally carries metadata-only participant observations for human management. These records contain no private human or assistant history.

## Durable state and delivery

`CollaborationState` is one authoritative aggregate containing revision, registrations, connections, outbox, ordered journal, and retained request receipts. Validation replays the complete journal and requires its resulting authority and messages to match current records. Capacity failures stop writes rather than evicting authority. Disconnect retains settled messages and cancels pending delivery.

`SendPeerRequest` supplies connection id, message text, and actor-scoped retry identity. The Host derives the sender from the calling Agent. `MessageReceipt` acknowledges a durably queued message with message id and revision; it does not acknowledge Agent completion. Delivery reserves persistent activation budget before accepting recipient input. Pause, missing grants, unavailable budget, and disconnect prevent new automatic activation. A target receipt is stored in its own Session, so recovery deduplicates delivery across restart.

The original [request and result declarations](../../packages/host/collaboration/src/types.ts), [strict aggregate schemas](../../packages/host/collaboration/src/record-schema.ts), and [peer message schema](../../packages/host/collaboration/src/message-schema.ts) own exact field types. Session V4 preserves explicit `collaboration-peer` attribution through replay and compaction; [the migration package](../../packages/session/session-format-v3-to-v4/README.md) rejects unadmitted legacy peer data.

## Authority limits

Peer text is discussion data. It grants no file mutation, command, task, review, integration, or enrollment authority. Snapshot and follow grants disclose only collaboration records for the pair. Local Host code and same-user Gateway callers are outside the authenticated browser admission guarantee. Automatic task workflows remain deferred behind separate Prerequisite P.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcollaborationmailbox--collaborationmailbox"></a>

### `ctx.collaborationMailbox` — `CollaborationMailbox`

Host-owned durable discussion service; acceptance never promises assistant completion.

```ts cordis-catalog
/**
 * Accept one sender-scoped request durably before scheduling any recipient activity.
 * @param caller - actual live Host Agent from tool execution, never model JSON.
 * @param request - strict peer message data with stable retry identity.
 * @returns original durable acceptance receipt, also on identical retries.
 */
async send(caller: Agent, request: SendPeerRequest): Promise<MessageReceipt>

/** Reschedule committed pending work; callers need not supply or reconstruct message bodies. */
recover(): void

/**
 * Drain the mailbox's currently scheduled delivery jobs.
 * @returns completion of currently scheduled mailbox work, excluding model execution.
 */
async whenSettled(): Promise<void>

/**
 * Stop new admissions and release owned effects before draining delivery jobs.
 * @returns quiescence after stopping admission, unregistering effects, and draining owned delivery jobs.
 */
async close(): Promise<void>
```

Types: [Agent](core.md)

Source: [`packages/host/collaboration/src/mailbox.ts`](../../packages/host/collaboration/src/mailbox.ts)

<a id="ctxcollaborationremote--collaborationremote"></a>

### `ctx.collaborationRemote` — `CollaborationRemote`

Owns the generated collaboration Remote namespace; Connection authenticates its wire transport.

```ts cordis-catalog
/**
 * Register both ordinary Sessions and grant their bidirectional connection in one durable transition.
 * Retries compare original caller intent before refreshing headers or generating another pair identity.
 * @param request - explicit UI disclosure, labels, observed workspaces, grants, budget, revision and retry key.
 * @returns the original committed receipt, also for a concurrent identical retry.
 */
@Remote async addPeer(request: AddPeerRequest): Promise<CollaborationMutationResult>

/**
 * Revoke the pair and cancel its unadmitted work in one durable transition; admitted work remains recorded.
 * @param request - owned pair, expected revision and stable request key.
 * @returns original disconnect receipt; disconnection does not undo recipient input.
 */
@Remote removePeer(request: PeerControlRequest): Promise<CollaborationMutationResult>

/**
 * Stop new peer activations without revoking the pair's record-view grants.
 * @param request - owned pair, expected revision and stable request key.
 * @returns original committed receipt.
 */
@Remote pause(request: PeerControlRequest): Promise<CollaborationMutationResult>

/**
 * Allow new peer activations within the existing explicit budget.
 * @param request - owned pair, expected revision and stable request key.
 * @returns original committed receipt.
 */
@Remote resume(request: PeerControlRequest): Promise<CollaborationMutationResult>

/**
 * Replace the pair's activation limit without refunding already charged activations.
 * @param request - owned pair, total limit, expected revision and stable request key.
 * @returns original committed receipt.
 */
@Remote budget(request: PeerBudgetRequest): Promise<CollaborationMutationResult>

/**
 * Read only collaboration records for the viewer's pairs with snapshot grants; no Session log is read.
 * @param request - ordinary stored viewing Session.
 * @returns a complete filtered committed view with its aggregate revision.
 */
@Remote async snapshot(request: CollaborationViewRequest): Promise<CollaborationSnapshot>

/**
 * Read human-owned pair controls and explicitly shared discussion records, independent of peer grants.
 * The same-user Host assumption does not provide action-authority isolation; no private Session log is read.
 * @param request - ordinary stored Session selected by the authenticated human UI.
 * @returns one complete committed management view with current metadata observations.
 */
@Remote async controlSnapshot(request: CollaborationViewRequest): Promise<CollaborationControlSnapshot>

/**
 * Stream complete human management views with the same record visibility as controlSnapshot.
 * @param request - ordinary stored viewer whose owned pairs define visibility.
 * @param signal - Remote generation cancellation.
 * @returns complete committed controls and shared records; no private history or task authority.
 */
@Remote({ mode: 'stream' }) async *controlFollow(request: CollaborationViewRequest, signal: AbortSignal): AsyncIterable<CollaborationControlSnapshot>

/**
 * Stream an initial filtered snapshot and complete committed revision views; gaps require no authority cache.
 * Slow readers coalesce pending views to the latest full snapshot. Disposal ends every active generation.
 * @param request - ordinary stored viewing Session; follow grants filter every item anew.
 * @param signal - Remote generation cancellation.
 * @returns complete snapshots of committed state only, including grant revocation and disconnection.
 */
@Remote({ mode: 'stream' }) async *follow(request: CollaborationViewRequest, signal: AbortSignal): AsyncIterable<CollaborationSnapshot>
```

Source: [`packages/host/collaboration/src/remote.ts`](../../packages/host/collaboration/src/remote.ts)

<a id="ctxcollaborationstore--collaborationstore"></a>

### `ctx.collaborationStore` — `CollaborationStore`

Storage owner; consumers publish snapshots only from committed domain/changed events.

```ts cordis-catalog
/**
 * Read the authoritative immutable committed aggregate; no secondary cache exists.
 * @returns current state; reads reject after storage closes.
 */
read(): CollaborationState

/**
 * Serialize one synchronous pure transform with revision checking at its queue slot.
 * Persistence failure leaves reads and notifications unchanged. Stale revisions reject before transformation.
 * Consumers resolve actor-scoped retry receipts before calling, then reread after a concurrency conflict.
 * @param expectedRevision - aggregate revision observed by the caller.
 * @param transform - pure operation producing the next state and one appended journal entry.
 * @returns new state after durable commit and domain/changed publication.
 */
transact(expectedRevision: number, transform: (current: CollaborationState) => CollaborationState): Promise<CollaborationState>

/**
 * Reject new writes immediately, drain admitted updates, and release the domain handle.
 * @returns storage teardown completion; repeated calls share the domain's close promise.
 */
close(): Promise<void>
```

Source: [`packages/host/collaboration/src/store.ts`](../../packages/host/collaboration/src/store.ts)
<!-- END GENERATED cordis-surface -->
