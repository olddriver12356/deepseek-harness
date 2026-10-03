---
description: "由 Vault 支持的 Expert Method 管理，以及面向 Web UI 当前会话的派发功能。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-experts

[English](README.md) | 中文

## 概述

此包渲染 Experts 应用面板，通过 Host Experts Remote 管理 Expert Method 记录，并将已批准的 Expert 派发到当前会话。Expert 定义仍是配置 Vault Agent Layer 下的 Markdown 包。Live Signal 卡片的 `shell.activity.selectors` 位还提供第二个入口：一个已批准 Expert 的多选区域，选中后在被清除前持续作用于每次普通发送，而不是一次性派发。

## 目录

- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

### Expert 派发消息

#### 模型看到的内容

用户确认任务后，对话式 Expert 通过 `beginSubmission()` 和 `prompt()` 向当前会话提交指令、可选输出风格与任务。委派式 Expert 提交包含 `dispatch_expert`、Expert 稳定 id 和任务简报的请求；Host 将其指令加载到子会话的 persona。

#### Token 影响

对话式指令、可选风格与任务增加当前会话的输入 token。委派式指令增加子会话的 token，父会话接收请求、启动回执和结束通知。打开、搜索、编辑或批准记录不会增加模型 token。

#### KV Cache 影响

该消息使用普通会话提示词路径。更换 Expert、风格或任务会改变提示词后缀，并可能降低缓存复用；此包不添加独立缓存策略。

### Live Signal Expert 选择器

#### 模型看到的内容

Live Signal 卡片选择器中每个勾选的 Expert 都会拼装进 `ctx.conversation.prefixes` 的 `'experts'` 来源。`@deepseek-ai/dsh-client-ui-conversation` 的输入框会在该会话每次普通发送时，把拼接后的文本前置到用户自己的文字之前，直到选择变化或被清空。

#### Token 影响

只要有 Expert 处于勾选状态，拼装的 Expert 内容就会给每一次发送增加输入 token，而不只是一次派发；取消勾选全部 Expert 后，下一次发送即不再带有该内容。

#### KV Cache 影响

勾选或取消勾选 Expert 会在下一次发送时改变提示词前缀，与通过派发对话框切换 Expert 一样，可能降低缓存复用。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **委派任务**：已批准的委派专家会通过当前父会话提交 `dispatch_expert` 请求。任务卡读取持久化的启动信息，打开带父子地址的子会话供查看或追问，并通过现有授权 subagent Remote 停止任务。启动成功不会显示为任务验收通过。
- **权限与上下文**：编辑器保存只读或可写权限，以及独立或 fork 上下文。对话式专家仍把指令注入当前会话。目前不提供自动文件隔离或显式验收工作流。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>面向维护者的工作上下文，点击展开</summary>

无。

</details>

**运行时 invariant：** 不发布 companion。Remote 结果、locale 注册表、会话绑定与 Slot 注册表是权威可观察面。
