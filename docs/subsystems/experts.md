# Expert Methods

English | [中文](experts.zh.md)

The [Host package](../../packages/host/experts/README.md) owns Vault-backed Expert Method CRUD and bounded delegated Expert admission. The [wire declarations](../../packages/host/experts/src/types.ts) own exact field types.

## Public records and requests

`ExpertRecord` describes the artifact identity, name, category, description, instructions, status, execution mode, model/reasoning selections, optional access/context policy, and update timestamp. `ExpertCreateRequest` provides the new Method's author-controlled fields. `ExpertUpdateRequest` identifies an existing artifact and replaces its author fields. `ExpertDeleteRequest` identifies an artifact for conservative deletion; `ExpertDeleteValue` confirms deletion with `deleted: true`. CRUD mutations run the Vault sync guard, replace Markdown atomically, and rebuild Agent Layer derived state. Listing reads the authoritative Method artifacts.

## Delegation admission

`reserveDelegation` accepts an Agent, approved Expert record, and already allocated child Session id. It rejects nested dispatch and over-capacity admission, then returns an idempotent release function. The caller releases the starting reservation after startup succeeds or fails. Persisted child policy governs tool visibility and execution on continuation and cold resume. This admission does not create filesystem isolation or automatic worktrees.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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

Types: [Agent](core.md) · [SessionId](core.md)

Source: [`packages/host/experts/src/index.ts`](../../packages/host/experts/src/index.ts)
<!-- END GENERATED cordis-surface -->
