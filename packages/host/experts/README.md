---
description: "Vault-backed CRUD Remote for Agent Layer Expert Methods."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-experts

English | [中文](README.zh.md)

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

The `dispatch_expert` tool accepts an approved Expert and a task, starts a child with its instructions, and returns the child result to the calling agent.

#### Token effect

The parent receives the tool schema and result; the child receives the selected Expert instructions and task.

#### KV Cache effect

Tool results append to parent history. Different Expert instructions change the child prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Descriptive capability fields**: stored model, reasoning, permission, skills, knowledge scopes, and tool policy do not change runtime capabilities in this first slice.
- **Conservative deletion**: an Expert package containing files besides `ARTIFACT.md` must be cleaned up manually before deletion.

<a id="dev-note"></a>

`dispatch_expert` registers raw JSON Schema for both input and output. Its input is an object with required `expert` and `task` string properties; author-facing property maps must be converted before registration because model adapters forward the registered schema unchanged.

### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The filesystem artifact and Agent Layer rebuild result are the authoritative observable surfaces.
