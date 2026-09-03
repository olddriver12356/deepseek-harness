# @deepseek-ai/dsh-client-ui-app-rail

[English](README.md) | 中文

App rail 插件：`app.rail` slot 的持久六入口导航占用者，通过 `ctx.appPanels` 驱动活动面板选择，但不管理面板内容或生命周期。AppRail 通过 `useSyncExternalStore` 读取活动面板 ID，渲染六个硬编码条目（按 agent、knowledge、experts、styles、monitor、news 顺序），用 `aria-selected` 标记活动条目，并在点击时调用 `ctx.appPanels.setActive(id)`。该组件仅拥有可见性；面板注册和占用由 `ctx.slots` 管理为独立关注点。

AppRail 消费从 `@deepseek-ai/dsh-client-ui-shell/client` 注入的 `ctx.appPanels`，并向该 shell 包声明的 `app.rail` slot 注册自己。后续面板包向 `shell.overlay` 注册，并读取相同的 `ctx.appPanels` 服务来发现活动状态，为整个 UI 中活动面板的标识创建单一事实来源，无需 rail 与面板实现之间的硬耦合。

`/client` 导出插件主体（`apply`/`inject`）、`RailEntry`（条目行结构）。AppRail 组件保持包内部以支持可测性。

## Model Experience

无，因为 rail 占用者只管理可见性和选择，不向模型请求添加任何内容。

#### KV 缓存效应

无；该包既不组装也不发送提供商请求。

## 已知限制与延后工作

- **无 roving tabindex**: rail 条目渲染为无状态按钮。箭头键导航延后到 Task 5，届时面板页面实现。
- **无 aria-controls**: 类似 tab 的 `aria-selected` 标记仅描述活动状态。`aria-controls` 到面板内容 ID 的链接延后到面板注册稳定后。
- **最小 tab 语义**: tab role 声明导航意图，但完整 tab 面板耦合仍为未来工作。
- **选择永不重新挂载面板**: 面板状态在可见性变更中保持，因为选择仅影响 `ctx.appPanels` 快照，不影响 slot 占用或组件生命周期。
