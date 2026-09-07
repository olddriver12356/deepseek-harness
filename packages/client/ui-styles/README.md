---
description: "Vault-backed Style Method management and current-Session dispatch for the web UI."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-styles

English | [中文](README.zh.md)

## Summary

This package renders the Styles application panel, manages Style Method records through the Host Styles Remote, and dispatches an approved Style into the current Session. Style definitions remain Markdown packages under the configured Vault Agent Layer, mirroring `@deepseek-ai/dsh-client-ui-experts`.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Style dispatch message

#### What the model sees

After the user confirms a task, the current Session receives one ordinary user message containing the selected Style's title, full instructions, and task through `beginSubmission()` and `prompt()`.

#### Token effect

The complete Style instructions and task add input tokens to that Session submission; opening, searching, editing, or approving records adds no model tokens.

#### KV Cache effect

The message uses the ordinary Session prompt path. Changing the Style or task changes the prompt suffix and may reduce cache reuse; this package adds no separate cache policy.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Single-Session execution**: dispatch runs in the current Session; subagent execution and automatic Vault knowledge retrieval remain deferred.
- **No cross-panel overlay yet**: the Expert dispatch dialog's own style selector still offers two hardcoded choices rather than reading approved Styles from this package; wiring that up is a separate follow-up.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The Remote result, locale registry, Session binding, and Slot registry are the authoritative observable surfaces.
