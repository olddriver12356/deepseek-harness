---
description: "Inspect native token, context, effort and trajectory projections in the Monitor page. "
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-monitor

English | [中文](README.zh.md)

## Summary

Inspect native token, context, effort and trajectory projections in the Monitor page.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

The persistent session-aware shell.app-overlay follows ctx.appPanels. Token and context values use native projections, effort reads native request configuration, and trajectory uses conversation.view. This page does not write vault data.

<a id="model-experience"></a>
## Model Experience

None, as this package manages local browser or process state without assembling model requests.

#### KV Cache effect

None; no prompt or provider request changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Absent native data remains a placeholder; refresh, filters and effort controls without a command contract remain disabled.

### Dev Note

The integration keeps the owner configuration and local feature state separate from disposable verification data.
