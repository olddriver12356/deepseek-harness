---
description: "在标准 Shell 与本地 Shell 之间共享布局尺寸和导航。"
kind: package-reference
---

# @deepseek-ai/dsh-client-ui-layout-core

[English](README.md) | 中文

## 概述

在标准 Shell 与本地 Shell 之间共享布局尺寸和导航。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## 行为

浏览器模块导出列宽计算、布局 store、LayoutController 和 DocumentTitle。它自身不注册根节点或提供 ctx.layout 服务。每个使用方 Shell 拥有自己的服务生命周期，并声明精确的客户端外部模块请求。

<a id="model-experience"></a>
## 模型体验

无，因为本包管理本地浏览器或进程状态，不组装模型请求。

#### KV Cache 影响

无；不会改变提示词或提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 同一组合中只能有一个 Shell 拥有根 slot 和 ctx.layout。

### 开发说明

整合时将所有者配置和本地功能状态与一次性验证数据分开。
