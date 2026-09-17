---
description: "Host and Client workspace control: mutate workspace navigation and follow its complete projection."
kind: "package-reference"
---
# Workspace Controller

English | [中文](README.zh.md)

## Summary

`@deepseek-ai/dsh-api-workspace-controller` owns the Host `ctx.workspaceController` service and the generated Client `ctx.remote.workspace` namespace. Its Remote methods create, rename, remove, and reorder Workspaces, reorder Sessions within a Workspace, archive and unarchive Sessions from Workspace navigation, and follow the complete Workspace projection. Use it through API Gateway when a Client must change or follow Workspace navigation. The package also owns `ctx.directoryPickerController` and the generated `ctx.remote.directoryPicker` namespace, because the directory-picking seam it carries is abstract and never a Loader entry of its own.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The controller also mounts `ctx.skillFilesController`, exposed as `ctx.remote.skillFiles`. Its `list(workspaceId)`, `tree(workspaceId, id)`, `read({ workspaceId, id, file })`, and `write({ workspaceId, id, file, content, revision })` methods operate only in a registered Workspace and return the standard Remote result envelope. `SkillArtifactId` identifies a physical entry; paths and revisions come from inventory and reads, not a client-provided absolute path.

Inventory reuses the filesystem provider's default root resolver, retains malformed and shadowed entries, and deduplicates canonical junction aliases. Directory bundles expose their own tree; flat Markdown skills expose only themselves. Nested symlink traversal, path escapes, non-UTF-8 content, and files over 2 MiB are rejected or made read-only. Session-specific provider configuration is not merged into this Host inventory.

Writes are serialized, compare the current canonical path and content revision, and replace existing files through a same-directory temporary file. Creation uses exclusive file creation. Conflicts preserve the caller's buffer, and temporary files are removed on failure. This protects normal concurrent editor saves; it is not a filesystem transaction against arbitrary external processes. A discovered vault sync guard must allow each write before mutation.

The Host controller serializes mutations whose correctness depends on current registry state and throws `RemoteError` with a stable `workspace/*` or `directory-picker/*` code for expected failures. Its `follow()` stream synchronously attaches to durable Workspace changes, emits one complete baseline first, then emits ordered `upsert`, `remove`, `order`, and `archived` increments. A reconnect starts another generation with a replacement baseline, so consumers do not depend on receiving every increment while disconnected.

The Client entry provides `ClientWorkspaceModel` and `createWorkspaceStateStream()`. The model owns Workspace rows, registry order, archived Session ids, unary mutation echoes, and stream/unary race resolution. A newer Host row wins by `updatedAt`; a committed stream order outranks an older unary response; a removed Workspace id cannot be resurrected by delayed data. The package exposes framework-neutral snapshots and subscriptions, leaving navigation policy and React hooks to the UI owner.

-----

<a id="model-experience"></a>
## Model Experience

None, as Workspace organization is browser and Host control state and registers no prompt, tool, or session event.

#### KV Cache effect

No direct effect; Workspace mutations do not alter model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- `follow()` replaces the whole projection after reconnect and has no durable cursor or incremental catch-up protocol.
- Process-local deletion markers prevent delayed data from reviving a removed Workspace only for the lifetime of the Client model.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. Workspace Registry owns persistence; every stream generation is a full projection.
