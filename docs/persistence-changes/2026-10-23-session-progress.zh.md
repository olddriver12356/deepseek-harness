---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-23-session-progress

[English](2026-10-23-session-progress.md) | 中文

## 概述

新增必读的 progress/change 记录，保存带修订号的 Session 里程碑、检查点、证据、授权及清单同步结果，并新增用于已准入轮次上下文的 long-term-progress 消息来源。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-23-session-progress
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "f5d99f25657e072b598781f7283d3bb6511f93024b3853329028964bead0d10c"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "cc56b1830e67bb45ce42640d75917653fa2101dc69bc700fbfbb2ba45f17b9c3"
    decision: same-version
  - root: "event:personal/observation-request"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "8b079827121a1e9e514bd3ae0a003c80365a9c985cecabfc6aa74ffec5f1a651"
    decision: same-version
  - root: "event:progress/change"
    previous: null
    after: "a844470015072a2558d778fdee310fb96e6965715dcedd6c530467ffa21e90e0"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "66da165f7246803812f97b1dbff58abbf86054c2497bd56a2847a232e26f485f"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "d0fa81cc847e60e9e9b09f83ce4267fedbee426f5331398c3a0028d047c8ed75"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新读取方接受不含进度记录的已有日志，并初始化空投影；新增必读记录通过严格状态转换验证回放。旧读取方不认识 progress/change 判别值，会在接纳或冻结事件前拒绝该 Session，不会跳过授权信息或截断尾部。消息来源联合类型为增量扩展：读取方保留普通消息内容，将来源视为元数据；来源不授予执行权限。含进度的 Session 同时包含新增必读判别值，因此旧读取方无法静默重建里程碑授权。已有事件表示及 Session 头保持不变；不提供降级路径。

<a id="verification"></a>
## 验证

已执行 node node_modules/vitest/vitest.mjs run packages/session/session-persistence/tests/storage-contract.spec.ts packages/goal/long-term-progress/tests：92 个测试通过，包含旧读取方按判别值拒绝及严格进度回放。已通过 dsh --profile sdk 执行 TypeScript SDK 的 long-term-progress 手工编写场景刷新：1 个选定场景通过。已执行 uv run --project python/sdk python scripts/smoke-python-runtime.py --scenario sdk-progress --exe apps/cli/lib/bin.js --update-snapshots：通过，验证持久化记录、订阅事件及已准入提醒。

<a id="dev-note"></a>
## 开发备注

无。
