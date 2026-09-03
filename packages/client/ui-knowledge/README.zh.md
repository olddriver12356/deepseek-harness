# @deepseek-ai/dsh-client-ui-knowledge

[English](README.md) | 中文

只读 Knowledge 应用面板插件。浏览器侧向 shell 拥有的 `shell.overlay` slot 注册一个持久的 `KnowledgePanel` 占用者，以 `ctx.appPanels` 作为唯一活动面板权威，并使用圆润的 DSH 交互表面呈现已批准的 Boujoy 艺术方向。选择其他应用面板时，组件应用原生 `hidden` 状态而不卸载 React 子树，因此搜索词、Layer 筛选条件和所选产物均保持不变。

## 运行时约定

插件通过 `ctx.slots.inject` 等待 `shell.overlay` 声明，并贡献稳定的 `knowledge-panel` 列表 id。其注入属性只包含 `ctx.appPanels` 和 `KNOWLEDGE_FIXTURE`。搜索、Layer 筛选、Layer 摘要快捷入口、结果数量、空状态和产物焦点全部从该不可变快照在本地派生。`打开 ARTIFACT` 处于禁用状态，不执行导航或回调。

## 数据与资产边界

`KNOWLEDGE_FIXTURE` 冻结根对象、两个数组、每个 Layer 和每个产物。该包不读取 vault，不调用 `ctx.fs`，不使用 Host Remote，不访问网络，也不暴露修改操作。真实 Agent Layer 数据保持延后，直到另行设计的只读能力能够在不改变展示状态的前提下替换 fixture（测试前置数据）。

collage 和 Fusion Pixel 字体是包拥有的受跟踪资产，由相对 CSS URL 引用。客户端 bundle 将原始字节输出到 `lib/assets`，已注册包的模块宿主只在 `/plugins/@deepseek-ai/dsh-client-ui-knowledge/assets/` 下提供其简单 PNG 和 WOFF2 文件名。`LICENSE-OFL` 与 `LICENSE-BOUJOY` 在发布包中保留相关署名。

## Model Experience

无，因为 Knowledge 面板读取浏览器本地 fixture，不向模型请求添加内容。

#### KV Cache effect

无；该包既不组装也不发送提供方请求。

## 已知限制与延后工作

- **仅 fixture**：五个产物用于演示已批准的信息架构，不反映实时 Agent Layer 内容。
- **只读操作**：产物操作保持禁用，直到 reader 行为和文件授权完成设计。
- **独立面板样式**：不存在通用应用面板框架。另一个真实面板证明稳定的重复约定后，才可提取共享代码。
