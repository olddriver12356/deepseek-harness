---
description: "Manage registered local web app processes and their loopback readiness. "
kind: package-reference
---

# @deepseek-ai/dsh-host-apps

English | [中文](README.zh.md)

## Summary

Manage registered local web app processes and their loopback readiness.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

AppsRuntime validates the registered package script and local URL, probes candidate ports, and launches through the managed subprocess service. Long, short and environment strategies pass the selected port; fixed strategy preserves it. A readiness timeout terminates the managed process and reports failure. Stop requests wait for process exit.

<a id="model-experience"></a>
## Model Experience

None, as this package manages local browser or process state without assembling model requests.

#### KV Cache effect

None; no prompt or provider request changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Port probing cannot reserve the eventual app socket; a bounded retry handles recognizable address-in-use failures.

### Dev Note

The integration keeps the owner configuration and local feature state separate from disposable verification data.
