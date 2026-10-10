---
description: "Vault-backed CRUD Remote for Agent Layer Expert Methods."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-experts

## Summary

This package exposes `experts/list`, `experts/create`, `experts/update`, and `experts/delete` for Method packages under `<vaultRoot>/Agents/5 Methods/Experts/`. Mutations run the Vault sync guard, replace Markdown atomically, and rebuild Agent Layer derived state.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Delegated Expert execution

#### What the model sees

The `dispatch_expert` tool accepts an approved delegated Expert id or name and a self-contained task brief. It starts a continuable background child and returns its durable id. Fresh context is the default; `context_mode: fork` includes completed parent turns. Expert instructions become the child persona, and model/reasoning overrides retain their existing meaning. The parent receives settlement notices, can follow up through `send_message`, and owns verification before final delivery.

#### Token effect

The parent receives the tool schema and result; the child receives the selected Expert instructions and task.

#### KV Cache effect

Tool results append to parent history. Different Expert instructions change the child prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Tool authority**: missing `access` defaults to `read-only`. Host `readOnlyTools` defaults to read, read_image, glob, grep, web_search and web_fetch; `writeTools` adds write, edit, bash, pwsh, job_output and job_kill for `access: write`. Admission intersects these lists with parent-visible tools. Children use native tools and enforce the persisted allowlist on execution, including scoped registrations and cold resume. This is tool authority, not filesystem isolation; write tools retain the inherited sandbox and approval policy.
- **Bounded starts**: `maxConcurrent` defaults to 2 active or starting experts per parent at initial dispatch. Only top-level agents can dispatch experts. Follow-up turns use the existing continuation service rather than a new scheduler.
- **Shared files**: task briefs must assign file ownership; automatic worktrees, file locks, review approval records and provider selection UI are deferred. The Experts Host plugin must remain installed to enforce expert policy when restoring children.
- **Conservative deletion**: an Expert package containing files besides `ARTIFACT.md` must be cleaned up manually before deletion.

<a id="dev-note"></a>

`dispatch_expert` registers raw JSON Schema for both input and output. Its input is an object with required `expert` and `task` string properties; author-facing property maps must be converted before registration because model adapters forward the registered schema unchanged.

### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The filesystem artifact and Agent Layer rebuild result are the authoritative observable surfaces.
