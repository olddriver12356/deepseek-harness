# Agent Note: 有界独立 peer 讨论工具

Status: implemented

[English](2026-10-03-bounded-peer-discussion-tools.md) | 中文

## Problem

人工授权的连接需要显式模型讨论，同时保护私有会话并维持 peer 执行权限限制。持久接受和后续接收方准入是不同事实；把发送结果当作回复会掩盖排队、取消或失败的工作。

## Decision

[Collaboration 包](../../../../packages/host/collaboration/README.zh.md#model-discussion-tools) 提供独立可选的 `./tool` 插件。它通过现有工具 effect 只注册 `collaboration_status` 和 `peer_send`，并通过 system-prompt 注册表添加指令。循环记录实际指令、调用和结果。Peer 执行仍要求显式权限允许列表，默认文件读取集合保持不变。

两个工具都从准确的活动普通执行 Agent 派生身份。Status 复用 Remote 已提交 snapshot 的过滤逻辑。发送把严格 connection/text/request-key 验证、持久接受、framing 上限和 actor 范围重试委托给现有 mailbox。后续准入或结算不改变原始 queued 回执；status 报告当前投递状态，不报告完成。工具不包含可选任务关联或执行操作。

## Alternatives considered

**随每个 collaboration 服务安装工具。** 这会向纯服务组合添加 schema 和指令，将显式模型能力与人工控制耦合。可选入口保留明确的安装选择。

**另建 status 过滤器或回执缓存。** 这可能与已提交授权和原始重试不一致。现有 Remote 和 mailbox 已负责这些事实。

## Consequences

Loader 组合测试覆盖严格执行、准确身份、授权过滤、回执稳定性、所有投递状态、原生与直接调用 guard 路径、模型输入输出日志和 effect 卸载。所有者本地 snapshot 固定实际组装的指令和 schema。Scenario patch 提供受支持 profile 配置贡献；最终完整 Session 录制和 SDK 预期仍属于集成工作。任意 Host 代码和同一用户的 Gateway 凭据仍是已记录的 Prerequisite P 限制。不引入新持久 schema 或执行权限。
