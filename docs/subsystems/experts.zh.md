# Expert 方法

[English](experts.md) | 中文

[Host 包](../../packages/host/experts/README.zh.md) 负责基于 Vault 的 Expert Method CRUD 及有界的委派 Expert 准入。[传输声明](../../packages/host/experts/src/types.ts) 负责精确字段类型。

## 公共记录与请求

`ExpertRecord` 描述 artifact 身份、名称、类别、说明、指令、状态、执行方式、模型/推理选择、可选访问/上下文策略及更新时间戳。`ExpertCreateRequest` 提供新 Method 的作者可控字段。`ExpertUpdateRequest` 标识现有 artifact，并替换作者字段。`ExpertDeleteRequest` 标识待保守删除的 artifact；`ExpertDeleteValue` 以 `deleted: true` 确认删除。CRUD 修改运行 Vault sync guard，以原子方式替换 Markdown，并重建 Agent Layer 派生状态。列表读取权威 Method artifact。

## 委派准入

`reserveDelegation` 接受 Agent、已批准的 Expert 记录及已分配的 child Session id。它拒绝嵌套派遣和超过容量的准入，再返回幂等的释放函数。调用方在启动成功或失败后释放启动预留。持久化的 child 策略管理继续执行和冷恢复时的工具可见性与执行。这项准入不创建文件系统隔离或自动 worktree。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxexperts--expertservice"></a>

### `ctx.experts` — `ExpertService`

Vault-backed Expert definitions and bounded parent-owned delegation admission.

```ts cordis-catalog
/**
 * Reserve one child before publication; only a root Agent may delegate within its configured concurrency limit.
 * @param parent - live root Agent whose tools bound the expert's available tools.
 * @param childId - child identity reserved before Agent creation.
 * @param expert - stored Expert definition supplying access policy.
 * @returns cleanup releasing startup admission only.
 */
reserveDelegation(parent: Agent, childId: SessionId, expert: ExpertRecord): () => void

/**
 * Read stored Expert definitions without creating or resolving an Agent.
 * @returns current definitions from the configured Vault.
 */
@Remote('list') list(): Promise<readonly ExpertRecord[]>

/**
 * Persist a new Expert definition through the serialized mutation queue.
 * @param request - validated new definition.
 * @returns the stored definition.
 */
@Remote('create') create(request: ExpertCreateRequest): Promise<ExpertRecord>

/**
 * Replace one stored Expert definition through the serialized mutation queue.
 * @param request - existing identity and replacement definition.
 * @returns the stored definition.
 */
@Remote('update') update(request: ExpertUpdateRequest): Promise<ExpertRecord>

/**
 * Remove one stored Expert definition through the serialized mutation queue.
 * @param request - identity to remove.
 * @returns successful deletion acknowledgement after storage completes.
 */
@Remote('delete') async delete(request: ExpertDeleteRequest): Promise<ExpertDeleteValue>
```

Types: [Agent](core.zh.md) · [SessionId](core.zh.md)

Source: [`packages/host/experts/src/index.ts`](../../packages/host/experts/src/index.ts)
<!-- END GENERATED cordis-surface -->
