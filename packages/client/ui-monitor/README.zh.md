---
description: "在监控页面查看原生 token、上下文、推理强度与轨迹投影。"
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-monitor

[English](README.md) | 中文

## 概述

在监控页面查看原生 token、上下文、推理强度与轨迹投影。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## 行为

持久的会话感知 shell.app-overlay 跟随 ctx.appPanels。Token 和上下文数值来自原生投影，推理强度读取原生请求配置，轨迹使用 conversation.view。此页面不写入 vault 数据。

<a id="model-experience"></a>
## 模型体验

无，因为本包管理本地浏览器或进程状态，不组装模型请求。

#### KV Cache 影响

无；不会改变提示词或提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 缺失的原生数据保留占位提示；没有命令契约的刷新、筛选与推理强度控件保持禁用。

### 开发说明

整合时将所有者配置和本地功能状态与一次性验证数据分开。
