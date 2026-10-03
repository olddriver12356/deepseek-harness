# Agent Note: Tools 中的只读 agent 工具目录

Status: implemented

[English](2026-10-02-agent-tool-catalog.md) | 中文

## Problem

Skills 面板能查看 skill 文件，但无法集中查看客户端已有的其他 agent 工具。用户需要去其他地方寻找 Session 命令和已配置的集成。

## Decision

现有 Skills 面板保留原本的视觉设计和 skill 编辑器。新标签加入 Commands、MCP、Hooks 和 Plugins 四个只读目录。每个标签都有名称和描述创建表单，将对应提示交给新 Session；Agent 在聊天中确认缺少的细节并创建工具。交接失败时重试复用同一个 Session 和请求。所选 Session 通过 `remote.commands.list` 提供命令；`remote.pluginInventory.list` 提供 host 和 agent preset 的插件条目。MCP 与 Hooks 是该插件目录的筛选视图。状态描述插件配置和阶段，不代表 MCP 连接已验证或 hook 已执行。

目录显示名称、描述、来源和状态。已知的 Session 斜杠命令还显示输入格式、具体适用场景和示例。Agent Teams 插件条目解释需显式启用的模型工具流程，并与原生斜杠命令区分；未知命令会明确提示仅有简述。目录不显示配置值，也不提供编辑、启用或停用操作。切换标签时沿用技能编辑器已有的未保存更改保护。

## Alternatives considered

另建 agent 工具页面会重复现有 Skills 导航和工作台样式。在有管理或诊断单个连接及执行的需求之前，分别为 MCP 和 hook 建立运行时目录需要新增数据契约。

## Consequences

Commands 跟随所选 Session；插件条目跟随 host 和所选 agent preset。未选择 Session 时，Commands 目录为空。目录不能证明 MCP 已连接或 hook 已运行；若将来需要这些信息，应使用专门的运行时数据。
