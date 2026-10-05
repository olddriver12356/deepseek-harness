---
description: "为现有 Web 配置档案提供可选的独立 Session 讨论。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-collaboration

[English](README.md) | 中文

## 概述

本文定义安装在 `dsh-base` 和 `dsh-web-app` 之后的可选讨论包。它加入 [Host 讨论服务](../../host/collaboration/README.zh.md)、讨论工具和[浏览器连接控件](../../client/ui-collaboration/README.zh.md)。默认配置档案不包含 collaboration 条目。

## 目录

- [配置](#configuration)
- [组合归属](#composition-ownership)
- [开发备注](#dev-note)
- [模型体验](#model-experience)
- [已知限制与暂缓工作](#known-limitations-and-deferred-work)

-----

<a id="configuration"></a>
## 配置

通过[配置档案插件管理器](../../boot/app-boot/README.zh.md)将此包加入 Web 配置档案的包列表。启动 `dsh --profile web` 前，必须在 `DSH_COLLABORATION_MAX_MESSAGE_BYTES`、`DSH_COLLABORATION_MAX_STATE_BYTES`、`DSH_COLLABORATION_MAX_JOURNAL_ENTRIES` 和 `DSH_COLLABORATION_MAX_REQUESTS` 中提供正整数部署上限。缺失或无效的值无法通过 Host 配置校验。也可以在后续配置档案补丁中，使用 Host 包文档中的字段替换 `collaboration` 条目的完整配置。

此包在 Peer 回合中显式允许 `read`、`glob`、`grep`、`collaboration_status` 和 `peer_send`。仅挂载工具不会授予这些权限。用户必须通过连接控件建立每个连接、接受披露提示并填写激活上限。此包不提供激活预算。

<a id="composition-ownership"></a>
## 组合归属

清单发布补丁及其依赖图的运行时入口。浏览器代码由 Client 包负责；生成的 Remote 绑定仍由 API 和 Host 包负责。此静态包没有可独立变化的运行时观测，因此不发布 invariant 配套入口。

<a id="dev-note"></a>
## 开发备注

组合测试使用已发布的 Web profile、隔离 overlay 和显式部署上限。录制与无密钥回放保留两个普通 Session role，并验证 Host 完整重启。Host 与 tool 的共享构建必须使公开入口使用同一个 authority marker 实例。

<a id="model-experience"></a>
## 模型体验

通过 Host 讨论服务及其工具入口间接影响模型；它们负责带边界的 Peer 输入、工具 schema 和讨论指引。

#### KV Cache 影响

此包自身不添加请求文本。Host 负责定义提示、schema 和追加消息的影响。

## 已知限制与暂缓工作
<a id="known-limitations-and-deferred-work"></a>

- 讨论连接同一 Host 内独立创建的普通 Session，并保留各自的标识、工作目录、模型和私有对话。计划、任务领取、实现、评审和集成不可用。同一用户的 Host 凭据不能隔离操作权限，也不能建立不可伪造的人类通道；此包不会启用这些工作流。
