# Agent Note: UI shell 包所有权

Status: implemented

[English](2026-09-01-ui-shell-package-ownership.md) | 中文

## Problem

Web frame 及其 grid tracks 需要一个统一的包边界来拥有持久 app rail、会话面板和后续 shell 状态。Package substitution 与可见 rail 行为还需要分别验证，才能把回归归因于正确的变更。即使旧 bundle row 已禁用，只要复制 `@deepseek-ai/dsh-client-ui-layout` 后仍让两个包同时进入编译期 catalog 扫描，就会产生重复 slot declarations 和有歧义的 owner prop types。

## Decision

`@deepseek-ai/dsh-client-ui-shell` 拥有 shipped Web frame，并替代 `ui-layout` 挂载。`ui-layout` row 保留但设为 disabled，让替换关系保持显式且可由 patch 覆盖。该包拥有 root registration，并声明 `app.rail`、`sidebar`、`conversation`、`details` 和 `shell.overlay`。根作用域的单值 `app.rail` 使用空 owner share，渲染在最左侧固定的 72px 轨道内，因此 app 导航会始终保留，而会话侧边栏仍可收起。两个绝对定位的拖动手柄都会在相对于 frame 左侧的位置上加上 rail 宽度。公开 client face 导出 `LayoutController`、`ILayout`、`AppPanelsController`、`IAppPanels`、`PanelId` 和四个 owner prop interfaces。

`ctx.appPanels` 只拥有活动 app 面板的可见性。其封闭的 `PanelId` 集合是 `agent`、`knowledge`、`experts`、`styles`、`monitor` 和 `news`，初始活动值为 `agent`。它的 `getSnapshot` 和 `subscribe` 方法构成 React `useSyncExternalStore` observable；写入相同值不会通知，取消订阅会移除 listener。Slot declarations 和 registration lifecycles 仍是 render authority 机制，因此可见性变化既不会选举占用方，也不会卸载面板状态。

Client catalog 在 slot contract 扫描和 exported type indexing 之前都排除 `packages/client/ui-layout/src/**`。该排除表达 shipped bundle 的替换关系，而不是放宽 duplicate detection。Focused generator test 证明被排除的旧实现不会制造重复声明或让 owner types 产生歧义，real Loader composition test 证明新 package row 能从 `cordis.yml` 挂载，client composition coverage 则证明 `ctx.appPanels` 会随 shell fiber 出现和消失。

外壳沿用[会话与会话视图所有权](2026-08-20-client-session-conversation-ownership.zh.md)的适配器分层。`ui-renderer` 拥有注册表，`client/store` 拥有布局存储，`ui-session` 提供会话钩子。严格会话作用域的 `details` 和 `shell.activity` 通过接收普通 React children 的 `SessionProvider` 渲染，因此无会话状态不会渲染需要会话身份的内容。活动卡通过 `useSessionPendingInteraction` 读取当前会话唯一的有效待处理项；Monitor 通过 `useConversation` 读取视图，而不是把会话状态当作视图快照。无会话回归检查覆盖选择会话及清空选择；相同检查在缺少 provider 时失败。

## Alternatives considered

**直接修改 `ui-layout`。** 这会让原有名称继续绑定到一个职责从 panel geometry 扩展为 native shell ownership 的包，也会让 rail 回归更难与 package substitution 缺陷区分。

**同时挂载两个包。** 两个包都会注册 root frame 并声明相同 child slots，导致 activation order 决定所有权，compile time catalog 也会合理地拒绝重复 contracts。

**用 slot registration 选举活动面板。** 这会混淆 shell 可见性与 render authority，在选择时重新挂载面板组件，并丢弃其本地状态。

**允许 catalog 中出现重复声明。** 静默选择其中一个声明会掩盖真实的所有权冲突，还可能让 dynamic plugins 学到 shipped bundle 并未挂载之包的 contract。

## Consequences

Shipped Web surface 使用 `ui-shell`，并为持久 app 导航保留独立于会话面板几何状态的 72px 空间。两个拖动手柄的绝对位置都包含 rail 宽度，因此仍与可见的侧边栏和详情栏边界对齐。App 面板选择是瞬时状态并从 `agent` 开始，而已挂载面板可以跨可见性变化保留本地状态。旧包仍可供显式 overlay 使用，但 generated catalog 描述 shipped default composition，因此不会包含故意重新启用 `ui-layout` 的 overlay。Active catalog sources 之间的重复声明仍然 fail closed。
