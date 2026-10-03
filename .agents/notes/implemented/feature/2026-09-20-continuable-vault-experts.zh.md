# Agent Note: Continuable Vault Experts

Status: implemented

[English](2026-09-20-continuable-vault-experts.md) | 中文

## Problem

委派专家等待一次性结果，面板没有直接调用入口，也没有真正执行的只读设置。通用 subagent 运行时已经支持持久化子会话、追问和授权中断。

## Decision

`dispatch_expert` 解析已批准记录并调用 `startContinuable`，返回包含父子会话 id 的启动凭据。现有 continuation 服务负责完成通知、追问和冷恢复。任务卡打开带地址的子会话，并调用现有中断 Remote。启动与验收分别表达，父 Agent 负责验证报告。

专家记录默认使用独立上下文与只读权限，fork 上下文需要显式选择。Host 将允许工具与父 Agent 可见工具的交集保存到 `experts/delegation`，projection 恢复同一工具权限。Agent 创建监听器安装最终的单调执行 guard 和原生工具展示。Schema 过滤改善模型选择，但不承担执行拦截。作用域内注册的工具也必须通过 guard。可写专家增加配置允许的修改工具，并继续继承 sandbox 和审批限制。

Host 默认将每个父 Agent 初次委派时正在运行或启动的专家数限制为两个。启动预留在接收成功或失败后释放。后续回合仍由现有 continuation 服务管理。只有顶层 Agent 可以委派专家，默认允许列表不包含委派和运行时重配置工具。

## Alternatives considered

**另建团队调度器。** 现有 continuation 生命周期已经管理持久化 id、通知、取消和消息路由，因此不另建一套。

**只写只读提示词或使用全局工具过滤。** 提示词不强制执行权限，而现有全局过滤无法限制独立的作用域注册，因此不采用。

**所有任务自动 fork。** 独立调查不需要复制父会话。任务单携带目标、上下文、负责范围和验收条件，并保留显式 fork 选项。

## Consequences

缺少权限和上下文字段的旧记录以只读、独立上下文启动，不会自动重写 Vault 记录。专家权限不是文件系统隔离，文件责任范围仍属于任务指令。自动 worktree、文件锁、持久化验收批准和 provider 选择界面暂缓。恢复专家子会话时需要保留 Experts Host 插件。

Loader 组合测试覆盖写入拒绝、允许写入、作用域工具覆盖、冷恢复和启动容量。组件测试验证父子地址导航、停止和启动文案。公开工具入口与 CRUD 入口一起显式构建。
