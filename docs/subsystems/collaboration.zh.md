# 独立 Session 协作

[English](collaboration.md) | 中文

显式启用的 [Host 包](../../packages/host/collaboration/README.zh.md) 负责同一 Host 上独立拥有的普通 Session 之间的 V1a 自由讨论。[组合包](../../packages/bundle/collaboration/README.zh.md) 一起挂载 Host、对等消息工具和侧栏 Client。仅安装不会创建注册或授权。

## 人工控制与视图

已认证 UI 提供 `AddPeerRequest`：发起方与对等方 Session 身份、显示标题、观测到的工作区路径、披露确认、显式 snapshot/follow 授权、激活额度、预期修订号和按 actor 隔离的重试键。Host 检查存储的身份和工作区元数据，推导 human actor，并提供非 JSON 的准入能力。工作区可以不同。`PeerControlRequest` 标识需要暂停、恢复或移除的现有连接；`PeerBudgetRequest` 替换总额度，不重置已经扣除的激活次数。

`CollaborationMutationResult` 保留已提交修订号和适用的连接/消息标识。相同 actor 下的同意图重试返回原结果；同键不同意图会被拒绝。`CollaborationViewRequest` 标识查看方 Session。`CollaborationSnapshot` 包含全局修订号及按授权过滤的注册、连接和发件箱消息。每个 follow 项替换完整视图。`CollaborationControlSnapshot` 额外提供仅含元数据的参与方观测，供人工管理。这些记录不含私有人类或助手历史。

## 持久状态与投递

`CollaborationState` 是包含修订号、注册、连接、发件箱、有序日志及保留请求回执的唯一权威聚合。验证重放完整日志，并要求生成的权限与消息等于当前记录。容量失败停止写入，不驱逐权限记录。断开连接保留已结算消息，并取消待投递消息。

`SendPeerRequest` 提供连接 id、消息文本及按 actor 隔离的重试身份。Host 从调用 Agent 推导发送方。`MessageReceipt` 以消息 id 和修订号确认消息已持久排队，不确认 Agent 执行完成。投递在接受接收方输入之前预留持久激活额度。暂停、缺少授权、额度不足及断开连接阻止新的自动激活。目标回执存储在其自身 Session 中，因此恢复能在重启后对投递去重。

原始[请求与结果声明](../../packages/host/collaboration/src/types.ts)、[严格聚合 schema](../../packages/host/collaboration/src/record-schema.ts) 及[对等消息 schema](../../packages/host/collaboration/src/message-schema.ts) 负责精确字段类型。Session V4 在重放与压缩中保留显式 `collaboration-peer` 归属；[迁移包](../../packages/session/session-format-v3-to-v4/README.zh.md) 拒绝未经准入的旧对等数据。

## 权限限制

对等文本是讨论数据，不授予文件修改、命令、任务、评审、集成或 enrollment 权限。snapshot 和 follow 授权仅披露该连接的协作记录。本地 Host 代码及同用户 Gateway 调用方不在已认证浏览器准入保证内。自动任务工作流仍等待独立的 Prerequisite P。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Agent](core.zh.md)

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
