---
description: "保留身份的 V3-to-V4 Session 迁移和必要输入策略验证。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v3-to-v4

[English](README.md) | 中文

## 摘要

本参考定义相邻 V3-to-V4 Session 迁移。持久化通过静态格式 catalog 使用本包。本包不执行文件 I/O；JSONL 所有者发布不可变的代际后继文件。

## 转换与验证

迁移边仅改变 header 版本。事件、消息身份、来源元数据、序号坐标、surface 操作和继承边界保持不变。每个迁移 stage 拥有自己的计数和继承边界。已发布 V3 的解码和验证继续委托前一包。包含保留的 `collaboration-peer` 来源或 `requiredAdmissionPolicy` 的 V3 数据被拒绝，因为历史数据不能追溯获得新的权限要求。

原生 V4 保留 V3 物理封装，在可恢复尾部处理之前验证必要准入元数据。提供的策略标识符必须是非空字符串。Collaboration 来源必须且只能包含 `kind`、`requiredAdmissionPolicy`、`senderSessionId`、`recipientSessionId`、`connectionId` 和 `messageId`；策略值为 `collaboration-peer`，身份非空且不含控制字符，发送方与接收方不同。验证覆盖 inbox 插入、用户消息、personal observation 请求消息和 title 请求消息。未知必要事件拒绝和可忽略事件保留继续使用已发布格式的行为。

## 模型体验

本库不添加提示词或工具文本。身份迁移保留模型输入与可复用前缀。运行时准入由 [Agent 所有者](../../core/agent/README.zh.md)负责；本库验证持久化要求，不授予权限。

## 已知限制与待办工作

本库不提供运行时策略或降级支持。[格式状态权威](../../../docs/session-format-status.zh.md)区分工作区写入方与已发布格式。当前写入方要求带版本名的快照后继文件，同时保持每个已提交前代不变。

**运行时不变量：** 不发布伴随检查。每个 stage 直接验证其拥有的 artifact，不维护独立的运行时观察。
