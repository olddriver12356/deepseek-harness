# Agent Note：Vault 支持的 Style Methods

状态：已实现

[English](2026-09-06-vault-backed-style-methods.md) | 中文

## 问题

Boujoy 的 Styles 页面（`04 风格`）此前从未迁移：既没有 host 包也没有 client 包，应用侧栏的 `styles` 条目只是一个未接线的标签。Boujoy 中的 Style 是一条普通的文件记录（名称、说明、指令、enabled），有两种用法：单独派发进 Agent，或作为输出声线叠加到 Expert 的派发之上。`packages/client/ui-experts` 的派发对话框此前已经为这个叠加概念留了一个占位：一个写死两个选项、无法管理的 `<select>`。

## 决定

`@deepseek-ai/dsh-host-styles` 拥有 `styles` Remote，将 Style 定义存储为 `<vaultRoot>/Agents/5 Methods/Styles/<title>/ARTIFACT.md` 下 `artifact_type: Method` 的包，以 `method_kind: Style` 区分。这完全镜像 `@deepseek-ai/dsh-host-experts`：相同的校验、路径限制、临时文件写入后原子改名、变更前的 Vault 同步守卫、变更后的 Agent Layer 重建，因此 Style 在派发进会话之前要经过与 Expert 相同的 owner-approval 门槛。Style 记录是 Expert 记录的严格子集：名称、说明、指令、状态，去掉了分类、模型、推理、权限与技能字段，因为 Boujoy 的 Style 本来也没有这些字段。

`@deepseek-ai/dsh-client-ui-styles` 逐包镜像 `@deepseek-ai/dsh-client-ui-experts`：相同的插件形状（`inject`、`apply`、一个 `shell.overlay` 注册）、相同的经 `beginSubmission`/`prompt` 的派发路径、相同的 CSS 设计变量与布局，复用同一张 `punk-collage-dark.png` 背景图以保持视觉一致。Style 卡片去掉了 Expert 的头像字母处理，改用装饰性色块，对应 Boujoy 自己的 `.style-swatch` 元素，因为 Style 不像具名 Expert 那样天然拥有单字母身份。

`@deepseek-ai/dsh-api-remotes` 的客户端装配（`packages/api/remotes/src/client/index.ts`）现在与 `expertsRemote` 并列导入并挂载 `stylesRemote`，走的是每个 Host Remote 都注册的同一个中心位置。

## 考虑过的替代方案

**在这次改动中一并把 Expert 派发对话框的风格下拉框接到真实 Style 数据。** 推迟。这确实是真实的后续工作，已经在两份 README 的已知限制中记录，但这是对 `ui-experts` 的改动，而不是迁移 Styles 页面本身的一部分，放进这次改动会把两个本可独立评审的变更耦合在一起。

**给 Style 记录加上和 Expert 一样的能力字段（模型、推理、权限、技能）。** 拒绝。Boujoy 的 Style 从来没有这些字段，且 Style 唯一的运行时效果就是被折叠进提示词的一段文字，没有需要记录的描述性意图字段。

## 后果

Style 的增删改查现在能在重载后存活，并对每个能访问 Vault 的 agent 可见，这与 Expert 已有的保证相同。已批准的 Style 派发进入普通的会话生命周期，可以从其日志重建。Expert 派发对话框自身的风格叠加在后续接线落地之前仍是两个选项的占位符，这个缺口现在被记录下来，而不是悄无声息。

## 测试

Host 测试固定了 Style artifact 解析、目录与标题一致性、以及"非法 Vault"的友好报错。Client 测试固定了 Vault 列表读取、仅已批准可派发、筛选、面板状态保持与创建后重载行为，镜像 `ui-experts` 的测试形状。`lint:contracts-ready`、覆盖改动项目图的 `tsc -b`、范围内的 vitest（`ui-styles` 与 `host/styles` 新增 12 个测试，改动涉及的包共 29 个）、以及 `check:ci:windows-blocking`（构建 86.67 秒，生产站点 99.51 秒）均通过。
