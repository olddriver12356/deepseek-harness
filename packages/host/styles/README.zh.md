---
description: "面向 Agent Layer Style Methods 的 Vault 持久化 CRUD Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-styles

[English](README.md) | 中文

## 概述

此包为 `<vaultRoot>/Agents/5 Methods/Styles/` 下的 Method 包公开 `styles/list`、`styles/create`、`styles/update` 与 `styles/delete`。变更会运行 Vault 同步守卫，以原子方式替换 Markdown，并重建 Agent Layer 派生状态。Style 记录是 Expert 记录的严格子集（名称、说明、指令、状态），镜像 `@deepseek-ai/dsh-host-experts` 的做法。

## 目录

- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

无，因为 Host 只持久化 Style 定义，而客户端通过普通会话提示词路径派发所选指令。

#### KV Cache 影响

在用户通过会话派发 Style 之前没有影响。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **保守删除**：如果 Style 包除 `ARTIFACT.md` 之外还包含其他文件，必须先手动清理才能删除。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>面向维护者的工作上下文，点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion。文件系统 artifact 与 Agent Layer 重建结果是权威可观察面。
