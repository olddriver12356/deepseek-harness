---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-03-collaboration-input-policy

[English](2026-10-03-collaboration-input-policy.md) | 中文

## 概述

在消息来源元数据中添加 requiredAdmissionPolicy 和严格归属的 collaboration-peer 来源分支，并将工作区 Session 写入版本从 V3 提升为 V4。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-03-collaboration-input-policy
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "1a3440e3577382704d42a6263aa463504eb74c566734a55e9503a63efcd02445"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-14-image-offload"
    after: "bea2b17ef9a661bb8df231dae81dfb06e1a79a729fce15e8688f2f4283858586"
    decision: version-bump
  - root: "event:personal/observation-request"
    previous: "2026-09-20-expert-delegation-and-observer-events"
    after: "674ebedef5e276d110225e53965f7a1b9b463d19e3c356b8ee34c603eeba17c6"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-09-14-image-offload"
    after: "502f04aa7b46cada5280ce8ad8e81986199418cfe1e37dc919fda3e51a4e7df6"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-09-14-image-offload"
    after: "cbcaf29b2fc01f442470184b9015839a593f690a5eb7cd83518d42cef9a48551"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

相邻 V3-to-V4 迁移保留事件数据、消息身份、序号坐标和继承边界。V3 输入不能追溯获得 V4 准入元数据。V4 在中断尾部恢复之前验证 collaboration 来源身份和固定策略标识符。所需策略缺失或已卸载时，运行时拒绝该输入。JSONL 发布创建带版本名的后继文件，完整保留已提交的 V3 文件。最新发布格式仍为 V3。

<a id="verification"></a>
## 验证

定向 Vitest 运行通过 29 项 catalog 和 V3-to-V4 迁移测试，并通过实际 JSONL V4 后继发布测试，确认保留 V3 字节、inode、大小和修改时间。协作恢复测试覆盖策略缺失、注册卸载、下游来源改写及普通纯人工会话恢复。四个受消息来源影响的事件根与 SessionHeader 版本变更一并确认。录制会话语料的后继文件仍是明确的集成工作。

<a id="dev-note"></a>
## 开发备注

无。
