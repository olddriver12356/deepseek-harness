---
description: "在应用页面注册并打开本地 Web 应用。"
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-apps

[English](README.md) | 中文

## 概述

在应用页面注册并打开本地 Web 应用。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## 行为

页面通过 Apps Remote 服务读取明确的注册记录，显示脚本和运行状态，并请求启动、停止或确认外部运行的应用。三种卡片配色与拼贴图标属于本地视觉设计。应用在浏览器中打开；注册不会扫描并导入文件夹中的所有仓库。

<a id="model-experience"></a>
## 模型体验

无，因为本包管理本地浏览器或进程状态，不组装模型请求。

#### KV Cache 影响

无；不会改变提示词或提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 项目必须提供兼容的 package 脚本和端口策略。

### 开发说明

整合时将所有者配置和本地功能状态与一次性验证数据分开。
