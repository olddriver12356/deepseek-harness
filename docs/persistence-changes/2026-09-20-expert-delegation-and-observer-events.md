---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-20-expert-delegation-and-observer-events

English | [中文](2026-09-20-expert-delegation-and-observer-events.zh.md)

## Summary

Adds the required experts/delegation event for durable expert tool authority and acknowledges the existing Personal observer request/result events.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-20-expert-delegation-and-observer-events
baseline: false
changes:
  - root: "event:experts/delegation"
    previous: null
    after: "bdb00161ec9e2dd9a47ad4fa1bfe847dbc6519dc9a12fd262b7a0d7015880706"
    decision: same-version
  - root: "event:personal/observation-request"
    previous: null
    after: "66bb8c1ae3a04476d83c0c84afd7224687af58bce9e4c521b403fb208c9ca014"
    decision: same-version
  - root: "event:personal/observation-result"
    previous: null
    after: "cb93fd3e186e31aebe7cdc6133da735b61ec1164239abe1e19cc48f3be22adea"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions remain unchanged. New expert sessions record the child id, approved expert id, access mode and allowed tools; restore reconstructs the same guard. Unknown required event types are rejected by older readers. The existing personal/observation-request and personal/observation-result events record auxiliary observer work and were previously missing their type-history acknowledgement. No historical event is rewritten.

<a id="verification"></a>
## Verification

Focused Experts and UI tests passed (61 tests). The Loader composition exercises read-only denial, write permission, scoped tool overrides, cold continuation and dispatch capacity. The Personal observer and Experts continuation follow-up check passed (5 tests).

<a id="dev-note"></a>
## Dev Note

None.
