# Agent Note: App rail 占用者

Status: implemented

[English](2026-09-01-ui-app-rail-occupant.md) | 中文

## Problem

导航 rail 占据屏幕左侧独立的固定轨道，与侧边栏或面板几何无关。六个条目（agent、knowledge、experts、styles、monitor、news）通过 ID 选择活动面板，但 rail 本身不管理面板内容、生命周期或 `ctx.appPanels` 服务的所有权。包边界必须保持 rail 选择与面板注册分离，以便回归仍可追踪，后续面板包可以依赖共享的活动面板状态而不产生对 rail 的循环依赖。

## Decision

`@deepseek-ai/dsh-client-ui-app-rail` 占有 `@deepseek-ai/dsh-client-ui-shell` 声明的 `app.rail` slot，并贡献 AppRail 组件。AppRail 通过 `useSyncExternalStore` 读取 `ctx.appPanels`，为每个面板 ID（agent、knowledge、experts、styles、monitor、news 硬编码）渲染一个条目，用 `aria-selected` 标记活动条目，并在点击时调用 `ctx.appPanels.setActive(id)`。Rail 不导出自身状态，也不在 cordis 中声明子节点。

`ctx.appPanels` 所有权保持在 `ui-shell` 包中；rail 仅消费其快照。这种分离允许后续面板包向 `shell.overlay`（由 `ui-shell` 声明）注册，读取相同的 `ctx.appPanels` 服务，并发现活动面板 ID，无需导入或依赖 rail 包。

Tab 语义设计简化。`aria-selected` 标记活动状态，但 `aria-controls` 到面板元素 ID 的链接、roving tabindex 箭头键导航和 tab 面板耦合都延后到 Task 5（面板页面实现时）。

## Consequences

Rail 保持为纯可见性选择器，与面板生命周期解耦。后续任务可以向 `shell.overlay` 添加面板实现并直接从 `ctx.appPanels` 读取活动状态，无需更改 rail 包。选择永不重新挂载面板组件；面板状态在可见性变更中保持。Tab role 表达导航意图，但无需实施完整 tab 面板语义直到面板实现（Task 5）。

## Alternatives considered

**在 rail 包中嵌入面板注册**: rail 可管理 `app.rail` slot 注册和面板容器生命周期，但这违反单一职责原则并在导航 UI 和面板占用之间产生硬耦合。后续注册新面板的包将依赖 rail 包的具体细节，使 rail 成为所有面板实现的必需依赖。

**使用独立枚举或上下文 hook 替代 `ctx.appPanels`**: 自定义 hook 可集中活动面板状态，但会错过 `ctx.appPanels` 已作为 `ui-shell` 中一级服务拥有该关注点的设计。在多个包中复制该意图会分散单一事实来源，使可见性变更无法自动传播给所有消费者。

**立即渲染完整 tab 面板语义**: 在具体面板页面存在之前在 Task 4 中添加 `aria-controls`、roving tabindex 和面板耦合会过度指定 rail 和面板都无法满足的契约。延后到 Task 5（面板实现存在时）可保持 rail 对自身所有权的诚实性。

## Consequences

- **Roving tabindex 导航**: 一旦面板页面挂载，实施跨 rail 条目的箭头键循环（Task 5）。
- **aria-controls 链接**: 一旦面板 ID 稳定，建立带元素 ID 指针的 tab-panel 关系（Task 5）。
- **Tab panel 耦合**: 完整 tab widget 语义（role 嵌套、`aria-label` 作用域）等待具体面板注册（Task 5）。
