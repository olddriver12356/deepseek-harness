---
description: "由 Vault 支持的 Style Method 管理，以及面向 Web UI 当前会话的派发功能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-styles

[English](README.md) | 中文

## 概述

此包渲染 Styles 应用面板，通过 Host Styles Remote 管理 Style Method 记录，并将已批准的 Style 派发到当前会话。Style 定义仍是配置 Vault Agent Layer 下的 Markdown 包，镜像 `@deepseek-ai/dsh-client-ui-experts` 的做法。`@deepseek-ai/dsh-client-ui-experts` 自身的派发对话框也会读取本包 Remote 暴露的已批准 Style，因此在此创作的 Style 可以作为输出声线叠加到 Expert 派发之上。Live Signal 卡片的 `shell.activity.selectors` 位还提供第二个入口：一个已批准 Style 的单选区域，选中后在被清除或替换前持续作用于每次普通发送，而不是一次性派发。

## 目录

- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### Style 派发消息

#### 模型看到的内容

用户确认任务后，当前会话会通过 `beginSubmission()` 和 `prompt()` 收到一条普通用户消息，其中包含所选 Style 的标题、完整指令与任务。

#### Token 影响

完整 Style 指令与任务会增加该次会话提交的输入 token；打开、搜索、编辑或批准记录不会增加模型 token。

#### KV Cache 影响

该消息使用普通会话提示词路径。更换 Style 或任务会改变提示词后缀，并可能降低缓存复用；此包不添加独立缓存策略。

### Live Signal Style 选择器

#### 模型看到的内容

Live Signal 卡片选择器中勾选的 Style 会拼装进 `ctx.conversation.prefixes` 的 `'styles'` 来源。`@deepseek-ai/dsh-client-ui-conversation` 的输入框会在该会话每次普通发送时，把这段文本前置到用户自己的文字之前（并跟在 Live Signal Expert 选择内容之后），直到选择变化或被清空。这种方式下同一时间只能有一个 Style 生效。

#### Token 影响

只要选中了 Style，拼装内容就会给每一次发送增加输入 token，而不只是一次派发；清空选择后，下一次发送即不再带有该内容。

#### KV Cache 影响

选中、切换或清空 Style 会在下一次发送时改变提示词前缀，与通过派发对话框切换 Style 一样，可能降低缓存复用。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **单会话执行**：派发在当前会话中运行；subagent 执行与自动 Vault 知识检索仍延后。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>面向维护者的工作上下文，点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion。Remote 结果、locale 注册表、会话绑定与 Slot 注册表是权威可观察面。
