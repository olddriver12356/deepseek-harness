---
description: "Share layout geometry and navigation between the standard shell and the local shell. "
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-layout-core

English | [中文](README.zh.md)

## Summary

Share layout geometry and navigation between the standard shell and the local shell.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

The browser module exports column calculations, the layout store, LayoutController and DocumentTitle. It provides no root registration or ctx.layout service by itself. Each consuming shell owns its service lifecycle and declares the exact client external request.

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
