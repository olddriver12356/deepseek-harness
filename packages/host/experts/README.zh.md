---
description: "面向 Agent Layer Expert Methods 的 Vault 持久化 CRUD Remote。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-experts

[English](README.md) | 中文

## 概述

此包为 `<vaultRoot>/Agents/5 Methods/Experts/` 下的 Method 包公开 `experts/list`、`experts/create`、`experts/update` 与 `experts/delete`。变更会运行 Vault 同步守卫，以原子方式替换 Markdown，并重建 Agent Layer 派生状态。

## 目录

- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### 委派专家执行

#### 模型看到什么

`dispatch_expert` 工具接受已批准委派专家的 id 或名称，以及自足的任务单。它启动可继续的后台子 Agent，并返回持久化 id。默认使用独立上下文；`context_mode: fork` 会包含父会话已完成的回合。专家指令成为子 Agent 的 persona，模型与推理强度覆盖保留现有语义。父 Agent 接收完成通知，通过 `send_message` 继续追问，并负责验证后再交付。

#### Token 影响

父 Agent 接收工具 schema 和结果；子 Agent 接收专家指令与任务。

#### KV Cache 影响

工具结果追加到父会话历史；不同专家指令改变子 Agent 的提示词前缀。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **工具权限**：缺少 `access` 时默认为 `read-only`。Host 的 `readOnlyTools` 默认包含 read、read_image、glob、grep、web_search 和 web_fetch；`access: write` 时由 `writeTools` 增加 write、edit、bash、pwsh、job_output 和 job_kill。启动时与父 Agent 可见工具取交集。子 Agent 使用原生工具，并在执行时强制检查持久化的允许列表，包括作用域内注册和冷恢复。这是工具权限，不是文件系统隔离；写入工具继续继承 sandbox 和审批策略。
- **启动上限**：`maxConcurrent` 默认限制每个父 Agent 初次委派时最多有 2 个正在启动或运行的专家。只有顶层 Agent 可以委派专家。后续回合使用现有 continuation 服务，不另建调度器。
- **共享文件**：任务单必须指定文件责任范围；自动 worktree、文件锁、验收批准记录和 provider 选择界面暂缓。恢复子 Agent 时必须保留 Experts Host 插件以执行专家权限。
- **保守删除**：如果 Expert 包除 `ARTIFACT.md` 之外还包含其他文件，必须先手动清理才能删除。

<a id="dev-note"></a>

`dispatch_expert` 为输入和输出注册原始 JSON Schema。输入是包含必需的 `expert` 和 `task` 字符串属性的对象；面向作者的属性映射必须先转换再注册，因为模型适配器原样转发注册的 schema。

### 开发说明

<details>
<summary>面向维护者的工作上下文，点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion。文件系统 artifact 与 Agent Layer 重建结果是权威可观察面。
