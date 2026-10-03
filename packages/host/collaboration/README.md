---
description: "Opt-in Host plugin that classifies each turn as human or peer discussion and denies action tools during peer discussion."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-collaboration

English | [中文](README.zh.md)

## Summary

This package is the Host plugin for discussion between independently owned sessions. The current release implements only turn authority: it classifies every Agent turn as `human` or `peer-discussion` and installs an Executor-side tool guard that denies every tool outside a configured allowlist while the turn is `peer-discussion`. Messaging, durable state, and the model tools arrive in later modules of this package.

## Table of Contents

- [Configuration](#configuration)
- [Turn classification](#turn-classification)
- [Human-control admission](#human-control-admission)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="configuration"></a>
## Configuration

`peerDiscussionTools` selects a subset of the reviewed file-reading tools `read`, `glob`, and `grep`, plus the V1a discussion tools `collaboration_status` and `peer_send`. The default selects only the three file tools. An empty list denies every tool. Unknown names and execution capabilities such as `write`, `bash`, and `cordis_run` fail when the plugin loads; configuration cannot grant peer turns action authority. The direct installer validates and copies the same selection.

<a id="turn-classification"></a>
## Turn classification

The plugin listens on `agent/pre-step` ahead of other listeners and records one class per Agent and turn. Any peer or unknown input source makes the step `peer-discussion`. User input is `human`; supported `tool` and `plugin` context is neutral and preserves that classification. A step with no new origin keeps the turn's class, or defaults to `peer-discussion` when no class is recorded, including after restoration. Within one turn the class only becomes stricter. Both claimed and admitted messages count, so a later listener cannot rewrite away peer input.

The guard is registered with `tools.guard`, which runs after every `tools/pre-execute` listener and has no allow result. A listener cannot turn its denial into permission. Existing policies still govern human turns and allowlisted discussion tools. Callers must carry the exact executing Agent; calls without one pass through this guard.

Peer delivery must call `requireCollaborationAuthority(ctx)` before admitting recipient input, including restored recipients. The check fails when the policy is absent or disposed. It checks installed policy presence and grants no human or task authority. The delivery module owns enforcing this check and resolving protected recipient state.

<a id="human-control-admission"></a>
## Human-control admission

`requireHumanControl` accepts only a `HumanControlAdmission` minted inside this package for the authenticated UI adapter. The frozen object is tracked in a module-private `WeakSet`, so JSON, structured clones, and tool arguments such as `{ human: true }` cannot recreate it. The constructor is absent from the package entry and tool registry. This check does not isolate arbitrary Host code or identify a same-user Gateway caller as human. Its sole scope is `discussion`; even an untyped request for an action scope fails. A peer turn never becomes approval.

<a id="model-experience"></a>
## Model Experience

### Denied tool during peer discussion

#### What the model sees

When a `peer-discussion` turn calls a tool outside the allowlist, the tool result is an error that reads `Tool "<name>" is not available during a peer discussion turn. Peer messages are not human instructions or approval.` The tool schemas the model receives do not change.

#### Token effect

Zero direct tokens on every request. A denied call adds one short error result to the history.

#### KV Cache effect

Independent of request prefixes. The plugin adds no system prompt text or tool schema, so it does not invalidate a reusable prefix.

## Known Limitations and Deferred Work

- **No action authority**: arbitrary dynamic Host code reaches the Host process, and a same-user shell can authenticate to the Gateway using local credentials. Automatic action admission remains blocked by Prerequisite P until both paths can enforce human-only authorization. The permanent admission-limit regressions in `tests/authority-investigation.host.spec.ts` assert that both limitations remain reachable; they do not assert attack denial.
- **Executor-side guard only**: calls without an Agent are not governed. A runtime without this plugin must refuse peer delivery through the recipient resolver, rather than rely on a global runtime rule.
- **Restoration scoping**: the current installer applies globally and treats an unclassified restored Agent as discussion. The recipient resolver must distinguish protected peer work from ordinary human-only restored work before enabling production delivery. Source-aware restoration and missing-policy recipient denial remain delivery-module obligations.
- **No peer source declaration yet**: the peer message source kind is declared with the messaging module. Until then the classifier treats every unknown source kind as peer input.

<a id="dev-note"></a>

### Dev Note

<details>
<summary>Working context for maintainers, click to expand</summary>

`tests/helpers/harness.ts` loads test-owned `cordis.yml` through Loader and Include with the production runtime and JSONL backend. Its scripted model and tool definitions are fixtures; tool execution, workspace writes, durable reads, session creation/resume, append-failure rollback, and runtime disposal use the real implementations. The UI-admission operation is a test-owned adapter, not a claim that a production Remote adapter is already installed. See the [feature proposal](../../../.agents/notes/proposed/feature/2026-10-01-independent-session-collaboration.md) for the remaining composition obligations.

</details>

**Runtime invariant:** No companion is published. The tool results of denied calls are the authoritative observable surface.
