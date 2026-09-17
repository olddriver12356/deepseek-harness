---
description: "Apply the shared Ponytail rules and retain the selected mode across turns. "
kind: package-reference
---

# @deepseek-ai/dsh-ponytail

English | [中文](README.zh.md)

## Summary

Apply the shared Ponytail rules and retain the selected mode across turns.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

The plugin reads the shared skill and a DSH-home mode file. User messages containing the supported mode or deactivation commands update that file. The prompt contribution follows DEPLOYMENT_PERSONA_PREFIX. Merely having this package in the repository does not enable it in a profile.

<a id="model-experience"></a>
## Model Experience

### Ponytail rules

#### What the model sees

The `ponytail:ruleset` section contains the configured shared skill text for the active mode. Its body is read dynamically rather than duplicated in this package.

#### Token effect

An active mode adds the selected rule text to each assembled system prompt; its size depends on the shared skill file and mode.

#### KV Cache effect

Changing the mode or shared text changes the prompt contribution and can invalidate the affected cached prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The mode file is shared within one DSH home; it is not session-local state.

### Dev Note

The integration keeps the owner configuration and local feature state separate from disposable verification data.
