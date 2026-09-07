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

None, as the Host only persists Expert definitions and the client dispatches selected instructions through the ordinary Session prompt path.

#### KV Cache effect

None until a user dispatches an Expert through a Session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Descriptive capability fields**: stored model, reasoning, permission, skills, knowledge scopes, and tool policy do not change runtime capabilities in this first slice.
- **Conservative deletion**: an Expert package containing files besides `ARTIFACT.md` must be cleaned up manually before deletion.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The filesystem artifact and Agent Layer rebuild result are the authoritative observable surfaces.
