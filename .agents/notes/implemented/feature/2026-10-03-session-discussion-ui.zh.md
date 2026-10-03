# Agent Note: Session 讨论 UI 与持久化来源

Status: implemented

[English](2026-10-03-session-discussion-ui.md) | 中文

## 问题

V1a 需要在现有 UI 内供人类管理普通 Session 的讨论 pair。Peer record grants 不能决定人类 control list，因为 snapshot 和 follow grants 都为 false 的 pair 仍需要暂停、budget 和断开控件。单独增加 Peer Conversation Definition 也会产生第二个 generic context node，因为 assembler 会分发给所有匹配的 Definition。最后，下游 pre-step listener 可能把 required-policy input source 改成 `user`，而普通首次加载历史页可能没有其原始 Inbox 事件，无法仅从当前窗口重建真实来源。

## 决定

可选 `ui-collaboration` 浏览器包向 `shell.activity.selectors` 提供 Portal，向 `shell.app-overlay` 提供原生讨论 dialog，并注册 keyed Peer renderer。不修改 shell 背景或父组件。两个 slot 的 renderer scope 不同，因此使用独立 handle，但每个 Session 只共享一个本地草稿、选择、可见性和每条连接的阅读位置 store 实例。已提交 Remote view 只存在于 data owner。

Host `controlSnapshot` 与 `controlFollow` 返回相同的完整人类管理投影：所选 Session 拥有的连接、端点注册与观察结果、显式共享 outbox 记录，不受 peer grants 影响。现有 peer `snapshot`、`follow` 和 model status 保留原有过滤。两个 stream 使用同一套 committed-store notification、coalescing 和 disposal 实现。观察结果来自存储的 header、不会 resolve Agent 的现有 registry，以及原生只读 Git metadata；缺失或格式错误的事实明确显示为不可用。

Chat 持有可逆的 source-kind exclusion contribution，`chatInputs.excludeSource`。Registry roster rebuild 在排队的 owner callback 中执行，脱离正在卸载的 contributor effect，并在 Chat 卸载时取消。Peer 插件持有自己的 Definition 和 renderer。Disposal 移除 Peer ownership，恢复 generic attributed context，不改变普通 human input。

AgentLoop 现有 pre-step capture 已在 listener 之前保留原始 required-policy input。在每个 step 第一次持久化 append 时，临时 identity map 为精确 message ID 选择最早的 required-policy source，同时保留转换后的 content。实际请求从 Session history 导出已 append 消息。不需要 history lookup、持久化 cache、新 Session 字段或 format migration。没有原始 required policy 的 input 保留原有行为。

Client DTO 边界使用纯 record/request/source schema 和 `/types` 中的 SessionId。Domain、projection 和 capability runtime 留在 Host 模块。原先 type-only import 穿过 receipt projection 和 Host root Context augmentation，错误地把浏览器 `ctx.sessions` 变成 `SessionStore`。显式 source schema ID annotation 让生成声明留在安全 type face。私有 WeakSet mint/check 和完整 journal replay consistency validation 保持原有行为。

## 考虑过的替代方案

从 Inbox predecessor 重建 source 无法处理截断的首次历史窗口。通过新增 source-event tracking 扩大历史页，或把历史 human 降级，都改变了无关的历史行为。在现有持久化 append 边界保留 required-policy attribution 可以直接修复缺陷。把 grant-filtered snapshot 与 follow stream 合并会错误保留或丢失 control row，因此 UI 只消费一个完整人类管理 generation。

## 结果

同用户 Host/Gateway 限制仍是 Prerequisite P。本次不声称隔离 action authority，也不声称人类 channel 无法伪造，不提供计划、任务或执行控件。Focused 测试覆盖管理 grant matrix、disconnect replacement、原生 metadata 未知值、终止 stream replacement、过期 refresh、来源转换后的持久化与实际模型请求、生产 Loader/renderer composition、截断窗口 Peer 展示、跨 slot 状态、取消与焦点恢复，以及卸载/重载回退。Task 10 负责 assembled replay、recorded manifest、exported-entry smoke 和唯一一次 combined GUI gate。
