---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-20-expert-delegation-and-observer-events

[English](2026-09-20-expert-delegation-and-observer-events.md) | 中文

## 概述

新增用于持久化专家工具权限的必需 experts/delegation 事件，并补齐已有 Personal observer 请求和结果事件的类型历史记录。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

已有会话保持不变。新专家会话记录子会话 id、已批准专家 id、权限模式和允许工具，恢复时重建同一 guard。旧读取器拒绝未知的必需事件。已有 personal/observation-request 和 personal/observation-result 事件记录辅助观察任务，此前缺少类型历史确认。不重写历史事件。

<a id="verification"></a>
## 验证

Experts 与 UI 的相关测试通过，共 61 个。Loader 组合覆盖只读拒绝、允许写入、作用域工具覆盖、冷恢复和委派容量。Personal observer 与 Experts continuation 的后续检查通过，共 5 个测试。

<a id="dev-note"></a>
## 开发备注

无。
