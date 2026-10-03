---
description: "Vault-backed Expert Method management and current-Session dispatch for the web UI."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-experts

English | [中文](README.zh.md)

## Summary

This package renders the Experts application panel, manages Expert Method records through the Host Experts Remote, and dispatches an approved Expert into the current Session. Expert definitions remain Markdown packages under the configured Vault Agent Layer. A second, standing entry point lives in the Live Signal card's `shell.activity.selectors` seat: a multi-select of approved Experts that stays active across ordinary sends until cleared, rather than a one-time dispatch.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

### Expert dispatch message

#### What the model sees

After the user confirms a task, conversational Experts submit their instructions, optional output style, and task to the current Session through `beginSubmission()` and `prompt()`. Delegated Experts instead submit a request naming `dispatch_expert`, the stable Expert id, and the task brief; their instructions are loaded by the Host into the child persona.

#### Token effect

Conversational instructions, optional style, and task add input tokens to the current Session. Delegated instructions add tokens to the child, while the parent receives the request, admission receipt, and settlement notice. Opening, searching, editing, or approving records adds no model tokens.

#### KV Cache effect

The message uses the ordinary Session prompt path. Changing the Expert, style, or task changes the prompt suffix and may reduce cache reuse; this package adds no separate cache policy.

### Live Signal Expert selector

#### What the model sees

Every Expert checked in the Live Signal card's selector composes into `ctx.conversation.prefixes` under the `'experts'` source. `@deepseek-ai/dsh-client-ui-conversation`'s composer prepends the joined text ahead of the user's own words on every ordinary send for that Session, until the selection changes or is cleared.

#### Token effect

The composed Expert block adds input tokens to every send while any Expert is checked, not just one dispatch; unchecking every Expert removes the block from the next send.

#### KV Cache effect

Checking or unchecking an Expert changes the prompt prefix on the very next send, which can reduce cache reuse the same way switching Experts through the dispatch dialog does.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Delegated tasks**: approved delegated Experts submit a request for `dispatch_expert` through the current parent turn. The task card uses persisted admission metadata, opens the addressed child for inspection or follow-ups, and stops it through the existing authorized subagent Remote. Admission is never displayed as task acceptance.
- **Access and context**: the editor saves read-only or write access and fresh or fork context. Conversational Experts still inject instructions into the current Session. Automatic file isolation and an explicit acceptance workflow remain deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The Remote result, locale registry, Session binding, and Slot registry are the authoritative observable surfaces.
