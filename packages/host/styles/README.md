---
description: "Vault-backed CRUD Remote for Agent Layer Style Methods."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-styles

English | [中文](README.zh.md)

## Summary

This package exposes `styles/list`, `styles/create`, `styles/update`, and `styles/delete` for Method packages under `<vaultRoot>/Agents/5 Methods/Styles/`. Mutations run the Vault sync guard, replace Markdown atomically, and rebuild Agent Layer derived state. A Style record is a strict subset of an Expert record (name, description, instructions, status), mirroring `@deepseek-ai/dsh-host-experts`.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as the Host only persists Style definitions and the client dispatches selected instructions through the ordinary Session prompt path.

#### KV Cache effect

None until a user dispatches a Style through a Session.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Conservative deletion**: a Style package containing files besides `ARTIFACT.md` must be cleaned up manually before deletion.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The filesystem artifact and Agent Layer rebuild result are the authoritative observable surfaces.
