---
description: "Register and open local web applications from the Apps page. "
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-apps

English | [中文](README.zh.md)

## Summary

Register and open local web applications from the Apps page.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

The page reads explicit registrations through the Apps Remote service, displays scripts and runtime state, and requests launch, stop or external-app confirmation. The three card palettes and collage icons are local presentation. Applications open in the browser; registration does not scan and import every repository in a folder.

<a id="model-experience"></a>
## Model Experience

None, as this package manages local browser or process state without assembling model requests.

#### KV Cache effect

None; no prompt or provider request changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- A project must expose a compatible package script and port strategy.

### Dev Note

The integration keeps the owner configuration and local feature state separate from disposable verification data.
