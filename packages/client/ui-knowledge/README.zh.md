---
description: "在 Knowledge 面板中浏览、蒸馏、审阅和批准 Agent 知识。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-knowledge

[English](README.md) | 中文

## 概要

Knowledge 列出 Intake、Processed 和 Knowledge · To learn 中的真实 Agent Layer 产物。持久覆盖层隐藏时保留搜索和筛选状态。Live Signal 蒸馏操作在原工作区打开新会话，填入引用原会话日志的未发送草稿。它不调用模型，也不写入知识产物。草稿要求先展示候选知识供用户审阅，再创建获批内容。

## 目录

- [运行时约定](#runtime-contract)
- [数据与资产边界](#data-and-asset-boundaries)
- [Model Experience](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="runtime-contract"></a>
## 运行时约定

插件通过 `ctx.slots.inject` 等待 `shell.overlay` 和 `shell.activity.capture` 声明，打开或刷新时通过 [Knowledge Remote](../../host/knowledge/README.zh.md) 加载记录。阅读器复用现有的不可信内容渲染器显示 Markdown，禁用原始 HTML 和危险链接。显式操作支持蒸馏、重试、搁置、恢复和审阅，错误持续可见。晋升需要目标预览和单独的默认未勾选批准框，修改目标会丢弃预览和批准。

点击卡片立即打开原生模态阅读器，固定标题栏，并在窗口内显示加载状态和错误。渲染后的正文保留 Boujoy 的黑色标题栏、桌面直角边框、蓝色阴影和手机底部抽屉，阅读面采用深炭灰、暖白文字和青色链接。保存的会话显示已提交的用户与助手正文；原始证据仅在明确请求时读取。审阅和学习标签取代验证清单。已接受的 Knowledge 必须标记为已学会才能预览发布，建议目标位置仍可编辑。关联产物链接和返回按钮用于原件与已处理条目导航。刷新重读当前文档；关闭保留列表选择和筛选。

<a id="data-and-asset-boundaries"></a>
## 数据与资产边界

生产不使用 `KNOWLEDGE_FIXTURE`，它仅保留为测试数据。Host 读取规范化的 Session JSONL，并委托 Vault 的 Agent Layer 工具存储。浏览器提供标识和明确的用户决策，不提供来源证据字节或伪造的 gate receipts。接受操作保留在 Agents 内，发布使用单独绑定内容的 Remote 操作。

不发布运行时 invariant companion：面板从 Remote 响应派生显示内容，不拥有独立持久化状态。

collage 和 Fusion Pixel 字体是包拥有的受跟踪资产，由相对 CSS URL 引用。客户端 bundle 将原始字节输出到 `lib/assets`，已注册包的模块宿主只在 `/plugins/@deepseek-ai/dsh-client-ui-knowledge/assets/` 下提供其简单 PNG 和 WOFF2 文件名。`LICENSE-OFL` 与 `LICENSE-BOUJOY` 在发布包中保留相关署名。

## Model Experience

蒸馏草稿要求模型使用现有会话查询工具读取原会话，引用事件序号，将日志内容视为证据，并先展示候选卡片请求用户批准。用户必须发送草稿才会启动模型轮次。其他 Knowledge 面板操作将模型请求委托给 Knowledge Host。

#### KV Cache effect

无；该包既不组装也不发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **发布范围**：仅发布新笔记，后续版本需要新文件名和重新批准，绝不覆盖已有 Vault 笔记。
- **刷新范围**：打开或刷新面板以重载持久化状态，阅读器不流式显示模型输出。
- **证据范围**：保存保留已提交的 Session 记录，不包含瞬时流式片段或附件字节。对话视图省略注入上下文、工具事件和非文本块；完整记录仍可查看。Markdown 渲染器不提供相对 Vault 链接跳转；关联产物按钮提供来源导航。
- **独立面板样式**：不存在通用应用面板框架。另一个真实面板证明稳定的重复约定后，才可提取共享代码。

### Dev Note

此面板不拥有独立持久化状态。
