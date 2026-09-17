---
description: "应用共享 Ponytail 规则，并跨轮次保留所选模式。"
kind: package-reference
---

# @deepseek-ai/dsh-ponytail

[English](README.md) | 中文

## 概述

应用共享 Ponytail 规则，并跨轮次保留所选模式。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## 行为

插件读取共享 skill 与 DSH home 中的模式文件。包含受支持模式或停用命令的用户消息会更新该文件。提示词贡献位于 DEPLOYMENT_PERSONA_PREFIX 之后。仓库中存在此包并不意味着某个 profile 已启用它。

<a id="model-experience"></a>
## 模型体验

### Ponytail 规则

#### 模型看到的内容

`ponytail:ruleset` 部分包含当前模式所配置的共享 skill 文本。其正文动态读取，不在本包中重复保存。

#### Token 影响

启用模式会将所选规则文本加入每次组装的系统提示词；大小取决于共享 skill 文件和模式。

#### KV Cache 影响

修改模式或共享文本会改变提示词贡献，并可能使受影响的缓存前缀失效。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- 模式文件在同一 DSH home 内共享，不是会话局部状态。

### 开发说明

整合时将所有者配置和本地功能状态与一次性验证数据分开。
