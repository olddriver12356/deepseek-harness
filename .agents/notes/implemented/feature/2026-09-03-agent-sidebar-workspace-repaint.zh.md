# Agent Note: Agent 侧边栏与 Workspace 浏览器重绘

Status: implemented

[English](2026-09-03-agent-sidebar-workspace-repaint.md) | 中文

## 问题

Agent 侧边栏和 Workspace 浏览器已经暴露原生的多 Workspace Session 模型，但其展示没有形成已批准 Boujoy 方向中的产品层级。界面缺少 `PROJECT TAPE` 与会话磁带处理、Session 总数、成对主操作、当前 Workspace 指示条和主列表加载状态。在手机宽度下，展开侧边栏仍会占用 grid track，而不是覆盖中心内容。

现有 `dsh.workspace.view.v5` store 保存有效的 Session 排序与更新时间展示状态。分组的多 Workspace 浏览器也是已接受的产品结构，因此视觉保真不能成为替换两者、引入新状态模型或改成单 Workspace tape 的理由。

## 决策

保留现有 `ui-workspace` 状态和分组浏览器。在 `--dsw-specific-agent-*` 下增加 Agent 专属 palette 与 display-font alias，再用这些 token 重绘 `ui-sidebar`、Workspace chrome 与行项目，采用已批准的高对比 tape、offset shadow 和 texture 语言，同时保留 DSH 的 focus、hover、disabled 与 reduced-motion 行为。

由 `ui-workspace` 拥有 expanded primary-action pair、`PROJECT TAPE`、Session 总数、当前 Workspace strip、会话磁带标题、修正后的搜索文案与列表 skeleton。当前 Workspace 从当前 Session 的 membership 推导，仅在没有当前 Session 时回退到 `recentWorkspaceId`。Add Workspace 与当前 Workspace menu 复用同一个 `WorkspacePickFlow` 实例，因此只会挂载一个 directory-flow owner。

由 `ui-shell` 拥有 phone drawer，因为该包拥有 grid tracks 与 panel width。在不超过 820 像素的 viewport 中，明确保持 sidebar grid track 为 56 像素，并在展开时把同一个 sidebar occupant 渲染成约 280 像素宽的 absolute overlay。中心内容保留在原 grid column，drawer 模式不显示 sidebar resize handle。

不增加 Refresh。原生 Session 与 Workspace projections 已持续推送变更，并不存在具有独立产品语义的 refresh operation。不增加 Session Delete，因为原生 delete-to-trash 仍不可用。

## 考虑过的替代方案

**用仅显示当前 Workspace 的 tape 替换分组浏览器。** 否决，因为已批准的 composition 保留多 Workspace 分组，并把新的当前 Workspace strip 作为其上方的指示条。

**让 `ui-sidebar` 实现手机定位。** 否决，因为该包接收 width 与 collapsed state，但不拥有外围 grid 或中心列几何。在那里实现 overlay 会让子组件依赖自己无法执行的布局假设。

**为 Add 与 Select 分别挂载 Workspace picker。** 否决，因为每个 picker 都可能拥有同一个 directory flow。一个 mode-driven picker 可提供两个入口，而不会复制 ownership 或 state。

**增加装饰性 Refresh 按钮。** 否决，因为它会暗示并不存在的手动一致性边界，而且必须发明原生 projections 之外的行为。

## 后果

展开后的 Agent column 现在具有 package-scoped Boujoy 处理和清晰层级，collapsed rail 则保留现有 New Session 快捷入口。Workspace 浏览器继续通过相同 native contracts 与 presentation store 支持 grouped 和 flat views、search、drag ordering、archive、rename 与 fork。

当任一 projection 仍处于 pending 时，主列表不再展示错误的空状态。当前 Workspace menu 与 Add Workspace action 共享一个 picker lifecycle，从成对操作启动 Session 时会优先使用推导出的当前 Workspace。

在手机宽度下，打开侧边栏不再改变 56 像素 grid track，也不会压缩中心列。展开后的 occupant 以带阴影的方式覆盖中心内容，保留普通 component tree 与 state，并且在离开 drawer 模式前不会出现 resize affordance。

Refresh 继续有意缺席。如果 native projections 以后获得真正的 retry 或 resynchronization contract，可以再以诚实的 loading 与 error feedback 暴露该操作，而不是加入只有视觉效果的控件。
