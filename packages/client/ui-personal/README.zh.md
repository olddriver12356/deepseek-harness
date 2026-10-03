---
description: "在 DSH 中使用 Bok 原版关于我页面和私人记忆工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-personal

[English](README.md) | 中文

## 概述

Personal 将 Bok 原版关于我界面与 Personal Core 引擎嵌入 DSH。页面提供画像、图谱、介入审核、证据与结果、清理五个视图。Host 验证浏览器访问身份，管理一个 Python 进程，并注册四个个人记忆工具。私人 Markdown 位于项目 Vault 和 Git 之外。现有对话与 Profile 笔记不会自动导入。

## 目录

- [配置](#configuration)
- [运行与数据](#runtime-and-data)
- [Vault Memory 阅读器](#vault-memory-viewer)
- [上游源码](#upstream-source)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [模型体验](#model-experience)

<a id="configuration"></a>

## 配置

需要 Python 3.11 或更高版本以及 `webServer`、`connection`、`tools`。通过 Web profile 的 `insert` 补丁启用插件；bundle manifest 声明解析依赖，但默认不启用。`vaultRoot` 配置独立 Bok 运行 Vault，`personalCoreRoot` 配置单独私人目录，`python` 指定解释器，`requestTimeoutMs` 指定进程请求期限。显式配置即授权初始化该私人目录；Bok 会拒绝不安全位置与非空且未标记目录。可用 `dshHomePath('bok-runtime')` 和 `dshHomePath('personal-core')` 配置本机同级目录。

<a id="runtime-and-data"></a>

## 运行与数据

### 中文理解与整理

通过 `bok_observe_conversation` 提交的每个 `candidate_statement` 必须是以 `用户` 开头的简体中文；Host 在 Bok 记录前拒绝其他表述，观察器的提取提示词也要求同样格式。

可选的 `compaction` 配置需要 `llm` 与 `agentDefaultModel` 服务，并显式设置 `maxInputBytes`、`maxOutputTokens`、`maxOutputBytes` 和 `timeoutMs`。关于我工具栏随后显示 **整理理解**。弹窗说明请求将发送的理解数量及其中私密理解数量；敏感理解从不发送。只有用户点击开始后，才会沿当前默认模型路由发送一次请求，提议合并语义相近（措辞不同但理解相同）或情境相近（同一情境、习惯、目标或项目的不同侧面）的理解并将非中文理解改写为中文。由于该请求不属于任何 Session，完整请求与校验后的提议保存在 `personalCoreRoot/.bok/dsh-compaction/`。被合并的理解必须类型、范围和敏感级别相同，每条表述都必须是以 `用户` 开头的中文。

用户逐张勾选卡片后应用。应用前先创建 Bok 备份，提议后版本或状态有变的理解会被拒绝，并且只使用 Host 保存的表述而非浏览器输入。改写调用 Bok 纠正服务。合并会以新表述取代第一条理解，使其余理解失效并指向替代项，同时把它们的来源引用复制到替代项，因此历史保留全部原始理解。每个提议只能应用一次，结果保存在提议旁。

### 自动观察对话

可选的 `observer` 配置需要 `llm` 服务，并显式设置 `enabled`、`maxInputBytes`、`maxOutputTokens`、`maxOutputBytes`、`maxPendingTurns` 和 `timeoutMs`。关于我页面提供持久化暂停开关和状态刷新。本机运行目录中 `dsh-observer.json` 保存的开关优先于初始配置。

观察器监听原生 `session/event`，在 `turn/end` 将新完成的顶层用户文字轮次加入队列。每个符合条件的轮次沿用该轮的 provider/model 路由，另发一次模型请求。完整请求记录为 `personal/observation-request`，不含对话内容的结果状态记录为 `personal/observation-result`；两种事件均不进入主对话的模型历史。原版 Bok 的信号校验、受限凭证、证据记录、安静学习和受保护画像审核保持权威。发布到共享 Vault 仍需用户另行批准。

进入模型前排除 Bok 检出的敏感文字，以及 `do_not_remember`、`session_only`、`external_content` 和“不要记住”等明确隐私标记或支持的表述。提取提示词也要求忽略引用材料、临时任务和秘密，但自然语言过滤不能作出保证；私人对话请使用暂停开关。非文字轮次、子智能体和恢复的历史不会进入观察。有界串行队列跳过超量输入，重启后不重放。暂停会取消模型工作，并等待未完成工作结束后确认开关。每个符合条件的轮次会在配置限额内产生额外模型用量。

**Vault 连接**按钮管理 `ideasVaultRoot` 下 `Memory/Semantic/profile/` 中由用户批准的 Markdown 导出。仅已生效、全局范围且明确授权 `all-agents` 的记录具备导出资格；敏感记录排除，私人级别记录在内的每次导出均需逐条确认发布。修改导出笔记的 statement 后会生成预览；确认操作在原版可重入进程锁内校验版本与文件内容，再调用 Bok 原版纠正服务。冲突不会静默合并。现有 `Memory/Semantic/Profile.md` 和全部记忆轮转规则保持不变。

原版 UI 操作成功后，授权被撤回或失效的记录会撤回共享导出，用户修改过的文件先保存在私有恢复目录。Vault 保护脚本阻止清理时，原始操作仍保持成功，页面显示警告并引导在 Vault 连接中重试清理。其他客户端对 Core 的修改在打开连接时核对，不使用持续文件监听器。旧 Git 版本、Vault 备份和私有恢复副本不会被擦除。同步基线与恢复文件位于已配置的本机 Bok runtime，不包含在原版 Bok 备份中；基线丢失时不会覆盖无归属的 Markdown 文件。不自动导入已有记忆。

关于我文档保留 Bok 的五视图布局与交互，通过 DSH 专用样式表使用深色表面、黄色选中态、青色细节、系统字体和一致的编辑及确认弹窗。样式表仅加载于该文档，原版随手记弹窗与其他 DSH 页面保持各自样式。

`ideasVaultRoot` 指定随手记使用的独立用户 Vault。右下角常驻按钮在当前界面打开弹窗，嵌入 Bok 原版随手记窗口。笔记原样保留输入文本和链接，以最小捕获元数据写入 `Ideas/Draft/Quick note <UUID>.md`。每次写入前运行现有 Vault 同步保护脚本。稳定草稿 ID 与原子且不覆盖的文件发布使重试保持幂等；修改文本产生新 ID。保存不调用模型，也不另建 Agent Knowledge 或 Personal Core 副本。本机草稿保留上游的 24 小时有效期，保存失败时保留草稿。该写入器需要 Windows PowerShell 和 Vault 现有的保护脚本。

浏览器面板占用 `shell.app-overlay`，首次打开时加载 `/personal/`。隐藏时保留挂载，切换页面不会丢失纠正草稿。隔离文档保留 Bok 页面样式、五个视图、对话框、图谱和状态转换。嵌入样式隐藏重复导航、无关的 Vault 侧栏和随手记入口。关于我页面的完整内容仍可使用。

Host 在提供资产或转发显式 Personal Core 浏览器路由前，使用 Connection 的身份验证与 Host/Origin 检查。Bok 的 owner token 不进入浏览器。Python 进程在经过认证的临时 loopback 端口运行原版 Bok HTTP 服务。浏览器请求保留上游路由白名单、请求限制和幂等处理。DSH 工具使用独立 `dsh` Agent 凭证，只获得上下文、对话观察、影响和结果权限。明文仅留在进程内存，磁盘只保存哈希。每次调用检查撤销状态，插件重启后仍保留撤销。重新启用被撤销访问需要用户明确执行凭证操作，重启不会取消撤销。

Claims、Observations、Impacts、Outcomes、历史与备份使用 Bok 原版 Markdown 和元数据格式，位于 `personalCoreRoot`。独立运行 Vault 保存对话收据、凭证哈希及可重建状态。不要为了显示旧卡片就将 `vaultRoot` 指向现有知识 Vault。worker 统一管理 UI 与工具操作，并随插件关闭；超时会停止进程，因此中断响应的写入操作在重试前应先刷新状态。适配器不持有另一份个人记忆状态，因此不发布独立 invariant。

<a id="vault-memory-viewer"></a>

## Vault Memory 阅读器

「记忆切片」布局使用带小角标编号的图像胶片卡片和纸张阅读区。三幅打包的黑白插图按来源路径固定分配，仅作装饰，不代表记忆文件中的真实照片。经历按文件名月份分组，无日期索引位于日期记录之后；长期事实按来源目录分组；交接按修改时间排序。数量表示文件数，包含索引笔记。卡片展示来源元数据。窄屏将可滚动文件列表放在阅读区上方。

About Me 内含 Memory 视图，来源为 `ideasVaultRoot/Memory`。它支持 Working、Episodic、Semantic 和 Handoff 浏览，并把 Flags 作为辅助入口，提供标题与路径搜索、刷新、修改时间以及 Markdown 阅读和原文模式。切换视图时原 Personal Core iframe 保持挂载。经过认证的 `GET /personal/api/memory` 列出来源文件，或读取 `path` 参数指定的文档。没有写入路由、模型调用、自动画像导入或第二份数据库。读取会拒绝路径越界和链接路径，单文档上限为一 MiB。目录最多 5,000 个文件，不含 Memory 之外的归档月份。该功能由 DSH 自有源码和打包背景实现，不修改固定版本的 Bok 代码。

<a id="upstream-source"></a>

## 上游源码

固定源码为 [Bok](https://github.com/asen-goat-mine/bok/tree/d556bfc918224712a1c0bc9660e04c829c8f7702)，commit `d556bfc918224712a1c0bc9660e04c829c8f7702`。`vendor/bok` 保留 Apache-2.0 LICENSE、NOTICE 和字体 OFL 许可。Python 引擎文件未修改。浏览器脚本带修改声明：初始化选择 Personal Core，请求改用经过 DSH 认证的路径，恢复可见时刷新仪表板，理解图谱是无边界画布，可拖动或用滚轮、触控板滚动平移；按住 Shift 时纵向滚轮变为横向滚动。DSH 自有部分是进程适配器、嵌入样式以及观察与整理脚本。

<a id="model-experience"></a>

## 模型体验

### 请求上下文与条件

#### 模型看到什么

启用后，工具注册表使用 Bok 原版 schema 与描述提供 `bok_person_context`、`bok_observe_conversation`、`bok_record_person_impact` 和 `bok_record_person_outcome`。`agent` 固定为已认证的 `dsh` 身份。围绕相关任务读取上下文，只对真实用户回合提交有依据的结构化理解，记录实际使用的主张和后续反馈。遵守 `external_content`、`session_only` 和 `do_not_remember`；受保护主张需要用户确认及单独授权。

#### Token 影响

注册四个工具描述与 schema。上下文结果受 Bok 请求中的数量与 token 预算限制。观察响应使用原版紧凑收据，不回显用户原文。实际序列化 token 数取决于当前模型 tokenizer 和工具呈现模式。每次用户发起的整理是一次独立、不带工具且不属于任何 Session 的请求，大小随已存理解增长，上限为 `compaction.maxInputBytes`。

#### KV Cache 影响

插件启用期间静态工具 schema 前缀保持稳定。记忆通过普通且有日志的工具结果返回；适配器不添加隐藏的模型输入，也不无条件插入动态提示前缀。个人化只改变后续工具结果及使用它们的决策。

<a id="known-limitations-and-deferred-work"></a>

## 已知限制与后续工作

- 原版嵌入内容为中文，外层 DSH 导航支持本地化。本集成需要 Web profile 和 Python，不支持无端口的 Electron 传输。它提供记忆工具，但不会静默扫描旧会话，也不会把整个私人库注入每次模型请求。观察需要结构化证据，可来自明确工具调用或可选自动观察器，页面初始为空。独立跨 Agent 客户端与凭证管理仍使用 Bok API/CLI。上游符号链接拒绝测试需要 Windows 允许创建符号链接。

### Dev Note

适配器仅持久化观察开关、整理收据和已有 Vault 投影记录。Personal Core 负责画像状态；Vault 文件是独立 Memory 阅读器的内容来源。
