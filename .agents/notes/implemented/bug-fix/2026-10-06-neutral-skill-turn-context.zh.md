# Agent Note: 协作回合中的中性 Skill 上下文

Status: implemented

[English](2026-10-06-neutral-skill-turn-context.md) | 中文

## 问题

普通人类回合带有 Skill 调用、目录或工作区指令上下文时，会被分类为 Peer discussion，并失去执行工具。持久回执投影在恢复时重复同一错误。

## 决策

协作插件只把明确列出的运行时上下文类型 `tool`、`plugin`、`skill-invocation`、`skill-catalog` 和 `agent-instructions` 视为中性。只有 `user` 能建立人类权限；Peer 和未知来源继续受到限制。实时分类与回执恢复共用 `classifyMessages`。派生投影版本递增，从未改动的 Session 事件重建缓存分类。

## 考虑过的替代方案

**信任所有非 Peer 来源。** 未知外部来源会在混合回合中继承人类权限。

**只修复实时分类。** 恢复仍会通过独立投影计算和缓存状态保留同一缺陷。

## 影响

人类请求的 Skill 保留已有工具策略。上下文不能单独授权执行，混合 Peer 输入仍受限制。工具允许列表、控制准入、Session 格式和已存储的来源标记均不改变。新增上下文生产者须经过明确审查后才能列为中性。
