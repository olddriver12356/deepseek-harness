# @deepseek-ai/dsh-client-ui-shell

[English](README.md) | 中文

外壳插件：四轨 AppFrame（`app.rail` | 侧边栏 | 中央栏 | 详情栏，并带有拖动手柄与让步链）加 `ctx.layout` 面板几何服务和 `ctx.appPanels` 活动面板服务；它注册到运行时拥有的 `root` slot，并声明 `app.rail`、`sidebar`、`conversation`、`details` 和 `shell.overlay`。根作用域的 `app.rail` 使用空 owner share，渲染在最左侧固定的 72px 轨道内，因此 app 导航会始终保留，而独立的侧边栏可收起至 56px 紧凑控制区。侧边栏的缩放边界是不可见命中条带，详情栏边界则保留其浮动胶囊；让步期间只有详情栏会收缩并随后自动关闭到零宽度。该包还提供主题呈现器：它消费解析后的 `ctx.theme` 快照，并将其投影到 document（用 `html { color-scheme }` 驱动原生 UA 控件，依据当前配色方案设置 `body[data-ds-dark-theme]`，并将主题的别名 token 设为 body 上的内联变量，同时拥有一个 `<meta name="theme-color">`，其内容随计算后的 body 背景色更新）。在应用调色板和 token 后进行测量，可确保渲染后的背景成为唯一的颜色依据；呈现器在 dispose（资源释放）时会移除其自有的元数据节点，并一并清除其写入的其他全局状态。

每个 `shell.overlay` 占用方都位于固定 AppRail 右侧的中央栏与详情栏区域。Knowledge 通过这个 slot 作为独立且持续挂载的面板，因此切换 `ctx.appPanels` 只改变可见性，不会移动或覆盖导航栏。

AppFrame 始终挂载 app rail、会话栏和详情栏容器。`SessionProvider` 接收普通 React children，在未选择会话时抑制严格作用域的详情与活动内容，并在会话 id 改变时重新挂载。布局 store 是瞬时状态，侧边栏以默认宽度启动，详情栏则保持关闭，且该 store 从不读写 `localStorage`。`ctx.appPanels` 从 `agent` 开始，接受 `agent`、`knowledge`、`experts`、`styles`、`monitor` 或 `news`，并向 React `useSyncExternalStore` 提供 `getSnapshot` 和 `subscribe`；再次选择活动值不会通知订阅方。它只拥有可见性，因此选择不会选举 slot 占用方，也不会卸载面板状态。hero 和其他未选中状态也会将详情栏的渲染宽度派生为零，但不会改变存储的宽度偏好。AppFrame 会跨越这些状态保留最后一个非 blank 会话 id：首个会话保持关闭；显式打开详情栏的操作会使用约定默认宽度；返回同一会话时恢复其未改变的宽度；选择不同会话时，详情栏会在绘制前关闭。app rail、会话和详情栏的 owner share 均为空，侧边栏 owner share 只包含 `collapsed` 和 `width`；注册方通过标准钩子获取业务数据，并从各自的 inject 接口获取操作。

`/client` 导出表层包含插件主体（`apply`／`inject`）、`LayoutController`、`ILayout`、`AppPanelsController`、`IAppPanels`、`PanelId` 和四个 owner-share 接口。AppFrame、面板 store 与让步求解器仍属于包内部。

浮动活动面板只为尚未被实际 details 栏或外部 Files 侧栏的 `--dsh-sidebar-width` 外框内边距覆盖的宽度预留空间。展开任一右侧面板都不会再从聊天区重复扣除 320px；拖动或关闭面板时会更新剩余重叠宽度，不改动面板偏好。未安装外部侧栏插件时，该宽度默认为零。

## 模型体验

无。布局外壳管理浏览器查看状态；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **外壳查看状态是瞬时状态**：重新加载会把 `ctx.appPanels` 恢复为 `agent`，同时恢复侧边栏默认值并使详情栏保持关闭；在不同会话 id 之间切换同样会关闭详情栏，并忘记拖动后的宽度，而未选中表面会以零宽度渲染详情栏，但不会修改几何信息。
- **让步链自动关闭通过推导零宽度实现，不会改动宽度偏好**：窗口变宽时面板会自行恢复；消费方禁止把 store 中的详情宽度当作实际渲染状态。
- **挤压重排期间不提供滚动锚定**：布局变化可能移动读者的 viewport。
