# Agent Note: 可选的所有者中继 Peer Inbox

Status: implemented

[English](2026-09-21-peer-inbox.md) | 中文

## Problem

可信所有者中继需要有界访问已经在线的根 Session，但不应获得创建 Session、修改权限、浏览器暴露或远程审批能力。follow-up 没有逐消息完成 Promise，响应丢失后的重试可能重复执行所有者工作。

## Decision

`packages/host/peer-inbox` 提供独立的认证 IPv4 回环监听器和持久请求账本。精确允许列表与在线根注册表共同检查 Session。插件通过 `followup` 提交带插件来源的 user-role 消息，以精确收件箱 claim 关联 turn，并在 `turn/end` 后仅返回该 turn 的最终 Assistant 文本。其他输入会抑制可能不相关的输出，不使用全 Agent idle 进行归因。

分派前请求记录先 fsync。指纹绑定请求 ID、运行时、Session 与文本。容量耗尽时拒绝请求，不遗忘旧 ID。原子文件发布遵循 JSON 存储实现，独占锁阻止并发写入，并在崩溃后明确要求操作员恢复。重启后的待处理记录变为 unknown；插件不再次提交。若在未挂载此插件时恢复 Session，原始持久化收件箱消息仍可能执行，因此 unknown 不是取消。

超时和卸载尽可能仅移除插件自己的待处理消息，不取消运行中的工作。完整结果 JSON、输入 JSON、HTTP 并发、待处理数量和账本生命周期容量都有明确限制。Windows 私有 ACL 由操作员预配置，插件不修改权限。

## Alternatives considered

- Web-server 路由会继承浏览器暴露与部署耦合；单独回环监听保持此可选传输独立。
- 全局 `whenIdle()` 混合所有者和中继工作；精确消息 claim 与 turn 终态提供更窄的证据。
- 可淘汰内存缓存会在淘汰/重载后重复执行；有界持久记录采取拒绝策略。
- 通用共享存储有原子替换，但没有此独占写入和陈旧锁策略；包内小型实现遵循既有发布惯例。
- 超时取消 Agent 会中断中继不拥有的工作。

## Consequences

MVP 不提供 Slack SDK、UI、审批、离线恢复或自动重放。账本满和崩溃残留锁需要操作员处理。输出仍受 Session 历史上下文影响；精确 turn 归因不是信息流沙箱。可选配置和密钥不得进入发行版默认 profile。

## Verification

包测试覆盖认证 HTTP、恶意输入、重复请求、重启账本、有界队列、取消/卸载、精确 turn 输出和其他输入抑制。Loader 使用 `cordis.yml` 与假 LLM 验证模型可见插件输入并固定组合转录。外部中继集成仅在显式设置 `DSH_RELAY_SOURCE` 后使用本地 HTTP 和假模型执行。独立顶层录制 Session 传输适配器仍待实现；包内转录不冒充这一缺失层。
