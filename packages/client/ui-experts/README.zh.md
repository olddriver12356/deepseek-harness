---
description: "由 Vault 支持的 Expert Method 管理，以及面向 Web UI 当前会话的派发功能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-experts

[English](README.md) | 中文

## 概述

此包渲染 Experts 应用面板，通过 Host Experts Remote 管理 Expert Method 记录，并将已批准的 Expert 派发到当前会话。Expert 定义仍是配置 Vault Agent Layer 下的 Markdown 包。

## 目录

- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### Expert 派发消息

#### 模型看到的内容

用户确认任务后，当前会话会通过 `beginSubmission()` 和 `prompt()` 收到一条普通用户消息，其中包含所选 Expert 的标题、完整指令、可选输出风格与任务。

#### Token 影响

完整 Expert 指令、可选风格与任务会增加该次会话提交的输入 token；打开、搜索、编辑或批准记录不会增加模型 token。

#### KV Cache 影响

该消息使用普通会话提示词路径。更换 Expert、风格或任务会改变提示词后缀，并可能降低缓存复用；此包不添加独立缓存策略。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **描述性能力字段**：模型、推理、权限、skill、知识范围与工具策略目前只记录意图；派发继承当前会话运行时。
- **单会话执行**：派发在当前会话中运行；subagent 执行与自动 Vault 知识检索仍延后。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>面向维护者的工作上下文，点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion。Remote 结果、locale 注册表、会话绑定与 Slot 注册表是权威可观察面。
