---
description: "管理已注册的本地 Web 应用进程及其回环地址就绪状态。"
kind: package-reference
---

# @deepseek-ai/dsh-host-apps

[English](README.md) | 中文

## 概述

管理已注册的本地 Web 应用进程及其回环地址就绪状态。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## 行为

AppsRuntime 验证注册的 package 脚本与本地 URL，探测候选端口，并通过托管 subprocess 服务启动。长参数、短参数与环境变量策略传递所选端口；固定策略保持原端口。就绪超时会终止托管进程并报告失败。停止请求等待进程退出。

<a id="model-experience"></a>
## 模型体验

无，因为本包管理本地浏览器或进程状态，不组装模型请求。

#### KV Cache 影响

无；不会改变提示词或提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 端口探测不能为最终应用预留监听套接字；有界重试处理可识别的地址占用失败。

### 开发说明

整合时将所有者配置和本地功能状态与一次性验证数据分开。
