---
description: "保存对话，显式蒸馏并审阅 Agent 知识，然后批准新的 Vault 笔记。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-knowledge

[English](README.md) | 中文

## 概要

Knowledge Remote 不调用 AI（人工智能）即可把完整的已提交 Session JSONL 保存到 Agent Intake。显式蒸馏通过默认模型创建独立派生产物。用户审阅把知识接受到 Agent 第 3 层，单独绑定内容的批准才会发布新的主 Vault 笔记。相同的 Session 证据复用已有产物。

## 目录

- [存储](#storage)
- [Model Experience](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="storage"></a>
## 存储

必填的 `vaultRoot` 指向包含 `Agents/Tools/DshKnowledge.ps1` 的 Vault。必填的 `distillTimeoutMs` 限制单次执行及中断后可重试的时间，必填的 `maxInputBytes` 拒绝超限的完整证据提示词而不截断。Web 组合提供 180000 毫秒和 524288 字节。桥接工具负责符合 schema 的 Markdown、来源哈希、Vault guard、共享写锁和派生索引重建。中断的暂存内容可恢复。

知识卡使用精简 v2 桥接契约：Intake、Processed、Knowledge，以及独立授权的 Methods。审阅只需绑定修订的接受或退回，不再要求六项 gate 和验证流水。主动概念提问可直接进入 Knowledge，但不声称已审阅。只有用户标记已掌握的卡片才能发布。原始证据独立保存，仅显式原文读取返回；普通读取通过校验后的路径提示直接读取当前卡片字节，移动或旧格式则回退至桥接查询。

晋升预览完整新增内容及已有 Knowledge 领域或 Resources 集合中的相对路径。明确批准绑定修订、目标和输出字节。发布排他创建新文件，绝不覆盖已有笔记。中断可能留下需要检查的新目标，重试不会覆盖它。迁移备份旧产物 Markdown，不改动证据和 Methods。

## Model Experience

### 显式蒸馏请求

#### What the model sees

独立的一次性请求只接收清洗后的正文、来源标识和现有候选目录名，不经过 Agent 组装、Memory、Vault 指令、MCP、技能或工具。工具调用输出会被拒绝。严格 JSON 响应最多包含十二张概念卡及允许范围内的建议目录。HTML 清洗不代表可信：来源和生成卡片始终只是数据。保存、搁置、审阅、掌握标记和发布不调用模型。

#### Token effect

处理通过当前默认提供方和模型消耗 token。封装输入超过 `maxInputBytes` 时直接失败，不截断。不创建普通 Agent 会话或工具循环，来源和结果卡片保留在 Vault。

#### KV Cache effect

原始对话上下文不变。蒸馏拥有独立请求历史，固定指令前缀能否复用取决于提供方。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **发布范围**：仅发布新的 Markdown 文件，原地更新已有笔记需要单独的合并工作流。
- **审阅范围**：用户接受不是独立事实核查，也不授权执行嵌入指令。
- **证据范围**：保留附件引用，但不复制附件文件或未提交的流式片段。
- **本地桥接**：需要 PowerShell 和规范 Vault 工具。单次桥接响应限制为 64 MiB，超限读取明确失败。
- **锁恢复**：已有写锁会阻止修改，服务不会猜测先前写入者是否已退出。

### 开发备注

路径提示不缓存正文或批准状态。每次读取检查当前字节，写入前由受保护桥接工具重新核对修订。
