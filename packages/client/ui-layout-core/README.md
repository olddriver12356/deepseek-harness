---
description: "Share layout geometry and navigation between the standard shell and the local shell. "
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-layout-core

## Summary

Share layout geometry and navigation between the standard shell and the local shell.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

The statically linked browser library exports column calculations, the layout store factory and LayoutController. The Web boot kernel seeds its exports into the platform module table. Each consuming shell creates its own store and owns its root registration and ctx.layout service lifecycle; the library has no Cordis plugin row or feature lifecycle. Each shell owns its Session-aware document title projection, keeping generated Remote contracts outside the static boot dependencies.

<a id="model-experience"></a>
## Model Experience

None, as this package manages local browser or process state without assembling model requests.

#### KV Cache effect

None; no prompt or provider request changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Only one shell may own the root slot and ctx.layout in a composition.

### Dev Note

The integration keeps the owner configuration and local feature state separate from disposable verification data.
