# Agent Note: UI shell 包所有权

Status: implemented

[English](2026-09-01-ui-shell-package-ownership.md) | 中文

## Problem

Web frame 及其 grid tracks 原本位于 `@deepseek-ai/dsh-client-ui-layout`。原生 shell 需要一个统一的包边界来拥有 frame、持久 app rail 和后续 shell 状态，同时不能把这次架构迁移与可见布局变化混在一起。即使旧 bundle row 已禁用，只要复制后的两个包仍同时进入编译期 catalog 扫描，就会产生重复 slot declarations 和有歧义的 owner prop types。

## Decision

`@deepseek-ai/dsh-client-ui-shell` 是 `ui-layout` 的零行为差异 fork，并在 shipped Web bundle 中替代旧包挂载。`ui-layout` row 保留但设为 disabled，让替换关系保持显式且可由 patch 覆盖。新包拥有 root registration，声明 `sidebar`、`conversation`、`details` 和 `shell.overlay`，其公开 client face 导出 `LayoutController`、`ILayout` 和三个 owner prop interfaces。

Client catalog 在 slot contract 扫描和 exported type indexing 之前都排除 `packages/client/ui-layout/src/**`。该排除表达 shipped bundle 的替换关系，而不是放宽 duplicate detection。Focused generator test 证明被排除的旧实现不会制造重复声明或让 owner types 产生歧义，real Loader composition test 则证明新 package row 能从 `cordis.yml` 挂载。

## Alternatives considered

**直接修改 `ui-layout`。** 这会让原有名称继续绑定到一个职责已从 panel geometry 扩展为 native shell ownership 的包，后续 app rail 工作也会难以区分回归来自包迁移还是新行为。

**同时挂载两个包。** 两个包都会注册 root frame 并声明相同 child slots，导致 activation order 决定所有权，compile time catalog 也会合理地拒绝重复 contracts。

**允许 catalog 中出现重复声明。** 静默选择其中一个声明会掩盖真实的所有权冲突，还可能让 dynamic plugins 学到 shipped bundle 并未挂载之包的 contract。

## Consequences

Shipped Web surface 只改变 package identity，不改变 frame behavior，后续 shell 工作获得独立 owner。旧包仍可供显式 overlay 使用，但 generated catalog 描述 shipped default composition，因此不会包含故意重新启用 `ui-layout` 的 overlay。Active catalog sources 之间的重复声明仍然 fail closed。
