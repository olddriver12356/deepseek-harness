---
description: "Vault-backed Expert Method management and current-Session dispatch for the web UI."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-experts

English | [中文](README.zh.md)

## Summary

This package renders the Experts application panel, manages Expert Method records through the Host Experts Remote, and dispatches an approved Expert into the current Session. Expert definitions remain Markdown packages under the configured Vault Agent Layer.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Expert dispatch message

#### What the model sees

After the user confirms a task, the current Session receives one ordinary user message containing the selected Expert title, full instructions, optional output style, and task through `beginSubmission()` and `prompt()`.

#### Token effect

The complete Expert instructions, optional style, and task add input tokens to that Session submission; opening, searching, editing, or approving records adds no model tokens.

#### KV Cache effect

The message uses the ordinary Session prompt path. Changing the Expert, style, or task changes the prompt suffix and may reduce cache reuse; this package adds no separate cache policy.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Descriptive capability fields**: model, reasoning, permission, skills, knowledge scopes, and tool policy record intent only; dispatch inherits the current Session runtime.
- **Single-Session execution**: dispatch runs in the current Session; subagent execution and automatic Vault knowledge retrieval remain deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The Remote result, locale registry, Session binding, and Slot registry are the authoritative observable surfaces.
