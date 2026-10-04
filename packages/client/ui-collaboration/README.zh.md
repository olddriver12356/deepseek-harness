---
description: "供人类管理独立 Session 讨论连接并展示来源明确的 Peer 消息的可选插件。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-collaboration

[English](README.md) | 中文

## 摘要

这个可选浏览器插件在现有 Live Signal 侧栏加入 Peer connections，并通过现有 shell overlay 打开讨论详情对话框。它保留 shell 的背景、布局和设计 token。对话框管理人类拥有的连接、披露、各 pair 的独立记录 grants、暂停、断开和显式 activation budget，并提供来源醒目的 Peer chat node。V1a 界面没有计划、任务、邀请、加入或执行控件。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

只把这个浏览器插件加入显式 opt-in assembly，同时启用 Host collaboration 插件并显式配置存储容量、消息上限和讨论工具 allowlist。默认 base 和 Web bundle 不包含 collaboration 行。这个包需要生成的 `remote.collaboration` contribution、Session Controller、UI Conversation、Chat input contributions、Slots 和 Locale。解析这个包本身不会激活 collaboration 或让 Session 加入连接。

选择 Add peer，选择普通 Session，填写展示标签，接受讨论披露，分别选择两个 pair grant 值并填写非负整数 activation limit。支持零，数值字段没有默认值。Host 在提交 pair 前验证实际存储的 workspace。未运行的普通 Session 仍可接收消息。不可用的 metadata 明确显示为未观察到，注册标签不会替代当前文件系统或 Git 事实。

选择连接可查看两端、实际 cwd、观察到的 checkout 与 branch、已计费激活、显式 pair grants 和共享消息状态。暂停停止新的 admission，断开移除 pair 并取消排队工作，Open session 调用 Session Controller。修改上限不会退还激活额度，也不能低于已计费次数。这些控件只授予讨论能力。

<a id="understand-the-implementation"></a>
## 理解实现

`data.ts` 为每个被查看的 Session 持有一个权威完整 Remote control view。`controlSnapshot` 与 `controlFollow` 的人类管理可见性一致：查看者拥有的所有 pair 和显式共享 outbox 记录始终可见，不受 peer snapshot/follow grants 影响。面向 peer 的两个 channel 保留各自的 grant 过滤。已提交全局 revision 的跳跃会替换整个 UI view。Refresh 拒绝过期 snapshot，终止性错误后创建新的单消费者 logical stream。插件卸载取消并等待所有 stream，再清理订阅者。

Portal 注册到 `shell.activity.selectors`。`shell.app-overlay` 中不持有 store 的 wrapper 等待 Session 被选中，再通过严格作用域的 `collaboration.board` 子 slot 渲染 Board，因此尚无 Session 的空白 shell 也能安全挂载。Portal 和 Board 共享一个由 renderer 管理的 Session store handle，保存草稿、选择、打开状态和阅读位置。store 不持有权威连接状态。组件接收 renderer 绑定的 observable hooks、JSON 兼容数据和 callback，不接收 Cordis context，也不直接订阅 Remote service。

存在实时 Session row 时，可用性跟随 Session Controller running 状态，即使 collaboration revision 没有变化。缺少该 row 时，metadata observation 保留 missing 或 unknown 含义。Portal 未读数量根据当前权威 incoming outbox 顺序，统计该连接最后已读 message ID 之后的消息。查看连接详情仅推进对应的本地阅读位置，也包含详情保持打开时收到的新消息。完整 view replacement 决定可见消息和数量；本地 store 不复制消息正文或权威状态。

原生 dialog 提供键盘模态和 Escape 取消，聚焦关闭按钮，并恢复打开控件的焦点。英文和中文标签使用同一组类型化 key。消息正文以惰性文本展示，包括 Markdown 和类似 HTML 的内容。自定义 Peer Definition 处理持久化的来源输入，可逆的 `chatInputs.excludeSource('collaboration-peer')` contribution 避免重复的 generic row。卸载后恢复 generic attributed context。AgentLoop 在持久化 append 边界按精确 input identity 保留原始 required-policy source，因此首次加载的历史页即使没有 Inbox 证据也能保留来源。

<a id="further-exploration"></a>
## 进一步探索

- [Host collaboration](../../host/collaboration/README.zh.md) 说明状态、投递、grants 和同用户限制。
- [Chat](../ui-chat/README.zh.md) 持有 generic source-kind presentation exclusion。
- [实现说明](../../../.agents/notes/implemented/feature/2026-10-03-session-discussion-ui.zh.md) 说明已获准的共享 owner 修改和替代方案。

<a id="dev-note"></a>
## 开发说明

Focused component、生产 Loader/renderer 和 HMR disposal 测试覆盖空白 shell 挂载后选择 Session、共享本地 store、原始来源回退和 stream 取消。Assembly replay、recorded manifests、exported-entry smoke 和 combined GUI gate 由 Task 10 负责。

**Runtime invariant:** 不发布 companion。这个插件不发出 domain event，也不拥有 authority；现有已提交 Host aggregate、renderer registry 和 focused disposal 测试约束其边界。

<a id="model-experience"></a>
## 模型体验

### 持久化 Peer 来源

#### What the model sees

重建的 `user/message` 保留原始 `collaboration-peer` source 和 listener 转换后的 content。这个浏览器包不增加工具、prompt 指令或自动转发；[Host 所有者](../../host/collaboration/README.zh.md#model-experience)定义带边界的讨论正文和按 grant 过滤的工具。

#### Token effect

浏览器状态不增加请求 token。保留 `requiredAdmissionPolicy` 和来源身份不会重复消息，也不会改变正文。

#### KV Cache effect

浏览器展示状态不会进入 provider request。保留来源 metadata 不增加第二条消息，也不修改正文，provider adapter 仍负责转换同样的重建消息。

## 已知限制与后续工作
<a id="known-limitations-and-deferred-work"></a>

- 经过认证的人类 control view 假设同一人拥有这个 Host 上的所有 Session。Session 和同用户 Gateway process 共享 OS credentials，本 UI 不隔离 action authority（Prerequisite P）。连接展示从不读取私有 Session history。已写入错误 source 的历史日志不能仅靠本 UI 恢复缺失来源。本次不增加数据迁移或 Session format。
