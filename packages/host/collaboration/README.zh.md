---
description: "可选启用的 Host 插件：保存人类授权的讨论连接，并在对等讨论期间拒绝执行类工具。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-collaboration

[English](README.md) | 中文

## 概述

此包是独立拥有的会话之间进行讨论的 Host 插件。它在一个持久聚合记录中保存显示注册信息、人类授权的会话对、激活预算、outbox、有序 journal 条目和原始请求回执。它把每个 Agent 回合分类为 `human` 或 `peer-discussion`，并安装 Executor 一侧的工具守卫，在回合为 `peer-discussion` 时拒绝配置的允许列表之外的所有工具。

## 目录

- [配置](#configuration)
- [回合分类](#turn-classification)
- [人类控制准入](#human-control-admission)
- [持久讨论状态](#durable-discussion-state)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="configuration"></a>
## 配置

`peerDiscussionTools` 从已审查的文件读取工具 `read`、`glob`、`grep` 和 V1a 讨论工具 `collaboration_status`、`peer_send` 中选择一个子集。默认只选择三个文件工具。空列表拒绝所有工具。未知名称和 `write`、`bash`、`cordis_run` 等执行能力会在插件加载时失败；配置不能授予对等回合执行权限。直接安装函数会验证并复制同一选择。

`stateLimits` 要求正安全整数 `maxStateBytes`、`maxJournalEntries` 和 `maxRequests`，没有默认值。组装配置还须提供路由至持久 backend 的 `storageDomain`。字节统计包含保留的完整聚合记录及其带版本的 JSON unit 封装，包括缩进、元数据和 UTF-8 多字节内容。超出容量时，写入或恢复打开以 `collaboration/capacity` 拒绝；检查保留数据并明确提高上限后再重试。系统不自动驱逐权限、待处理消息、journal 条目或回执。

<a id="turn-classification"></a>
## 回合分类

插件在其他监听器之前监听 `agent/pre-step`，并为每个 Agent 的每个回合记录一个分类。任何对等或未知来源的输入都会使步骤成为 `peer-discussion`。用户输入是 `human`；受支持的 `tool` 和 `plugin` 上下文是中性的，会保留该分类。没有新来源的步骤沿用回合分类；如果没有已记录的分类，包括恢复之后，则默认是 `peer-discussion`。同一回合内分类只会变得更严格。已领取和已准入的消息都计入分类，因此后续监听器不能通过改写消除对等输入。

守卫通过 `tools.guard` 注册，它在所有 `tools/pre-execute` 监听器之后运行，并且没有放行结果。监听器无法把它的拒绝变成许可。已有策略仍约束人类回合和允许列表中的讨论工具。调用方必须携带实际执行的 Agent；不带 Agent 的调用会通过此守卫。

对等消息传递必须在准入接收方输入之前调用 `requireCollaborationAuthority(ctx)`，恢复后的接收方也不例外。策略不存在或已卸载时，此检查失败。它只检查已安装的策略，不授予人类或任务权限。消息传递模块负责执行此检查并解析受保护的接收方状态。

<a id="human-control-admission"></a>
## 人类控制准入

`requireHumanControl` 只接受此包内部为经过身份验证的 UI 适配器签发的 `HumanControlAdmission`。冻结对象记录在模块私有的 `WeakSet` 中，因此 JSON、结构化克隆和 `{ human: true }` 等工具参数无法重建它。构造函数不在包入口和工具注册表中。此检查不隔离任意 Host 代码，也不把同一用户的 Gateway 调用方认定为人类。唯一的作用域是 `discussion`；即使请求未经类型检查，执行作用域也会失败。对等回合永远不会成为批准。

<a id="durable-discussion-state"></a>
## 持久讨论状态

`ctx.collaborationStore` 拥有版本 1 的 domain `collaboration`、table `state`、record `current`。首次打开会持久初始化此记录。未知版本和损坏的权威记录会拒绝整个打开操作；初始化失败会释放存储。store 在现有 storage-domain 写入队列上使用 `KvTable.update`，没有第二个数据库或权限缓存。

`read()` 返回不可变的已提交状态。`transact(expectedRevision, transform)` 在其排队位置检查 revision，应用一次同步纯变换，验证状态和容量，再持久提交一条新增 journal 条目。陈旧写入以 `collaboration/revision-conflict` 拒绝，并返回当前 revision。写入失败既不改变内存，也不发布通知。消费者只发布匹配的已提交 `domain/changed` 结果。dispose 立即拒绝新事务，等待已接纳事务完成后再关闭存储。

`applyDiscussionOperation` 分开接收已验证的操作数据，以及 Host 派生的 actor、时间戳、请求 key 和私有人类准入。请求不包含覆盖 actor 的字段。注册记录只含显示字段，不授予权限。连接保存双向会话对，带已接受的披露、仅属于该会话对的 snapshot/follow 授权、暂停状态和明确的人类设置激活上限。`add-peer` 原子注册对方并打开连接。人类控制需要私有 discussion 准入；预算更新保留已扣减的 `used` 数量。每次操作都把完整数据、actor、revision 和时间戳写入 journal。

outbox 状态为 `queued`、`admitted`、`cancelled` 和 `failed`。成功入队及其原始发送回执表示请求已接受。`reserve-activation` 原子扣减会话对的预算并添加 `activationReserved: true`，消息仍保持排队；恢复时必须利用此事实，避免再次扣减。`admit` 记录持久的接收方输入接受。断开连接会取消此会话对的全部排队工作，包含已预留者，并单独保留已准入工作。它不退还费用，也不撤回接收方输入。传递消费者负责接收方 pre-step 权限检查、持久回执核对、完整消息大小限制和回合顺序。

重试消费者验证规范化的操作数据，从 Host 派生 actor，并在事务前和并发 revision 冲突后调用 `findRequestReceipt`。相同 actor/request key 返回原始结果和 revision，不写入。相同 key 对应不同操作时，以 `collaboration/request-conflict` 拒绝。其他会话或 actor kind 使用相同 key 时属于独立命名空间。即使状态随后改变，回执仍保留原始 revision 和 connection/message 标识符。

<a id="model-experience"></a>
## 模型体验

### 对等讨论期间被拒绝的工具

#### 模型看到什么

当 `peer-discussion` 回合调用允许列表之外的工具时，工具结果是一条错误：`Tool "<name>" is not available during a peer discussion turn. Peer messages are not human instructions or approval.` 模型收到的工具 schema 不变。

#### Token 影响

每次请求的直接 token 为零。被拒绝的调用会向历史追加一条简短的错误结果。

#### KV Cache 影响

与请求前缀无关。插件不增加系统提示词文本或工具 schema，因此不会使可复用的前缀失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延后工作

- **没有执行权限**：任意动态 Host 代码可以访问 Host 进程，同一用户的 shell 可以使用本地凭据向 Gateway 完成身份验证。在两条路径都能强制实施人类专属授权之前，自动执行准入继续被 Prerequisite P 阻塞。`tests/authority-investigation.host.spec.ts` 中的永久准入限制回归测试断言这两个限制仍可触达，并未断言攻击被拒绝。
- **仅 Executor 一侧的守卫**：不带 Agent 的调用不受管控。没有此插件的运行时必须通过接收方解析器拒绝对等消息传递，不能依赖全局运行时规则。
- **恢复范围**：当前安装函数全局生效，并把未分类的恢复后 Agent 视为讨论。在启用生产环境的消息传递之前，接收方解析器必须区分受保护的对等工作与普通人类会话的恢复工作。基于来源的恢复和缺少策略时拒绝接收方仍是消息传递模块的责任。
- **尚无对等来源声明**：对等消息的来源类型随消息模块声明。在此之前，分类器把所有未知来源类型视为对等输入。
- **仅保存讨论状态**：不持久保存计划、enrollment、task claim、角色或执行审批。Remote 控制、模型工具和传递消费者必须先执行请求准入，再调用 Host 状态操作。

<a id="dev-note"></a>

### 开发说明

<details>
<summary>维护者的工作上下文，点击展开</summary>

`tests/helpers/harness.ts` 通过 Loader 和 Include 加载测试自有的 `cordis.yml`，使用生产环境运行时和 JSONL 后端。脚本化模型和工具定义是测试夹具；工具执行、工作区写入、持久读取、会话创建与恢复、追加失败回滚和运行时清理均使用真实实现。UI 准入操作是测试自有的适配器，并不表示生产环境的 Remote 适配器已安装。剩余组合责任见[功能提案](../../../.agents/notes/proposed/feature/2026-10-01-independent-session-collaboration.zh.md)。

</details>

**运行时不变量：** 不发布配套包。被拒绝调用的工具结果和持久聚合记录是权威数据；store 不创建独立缓存。storage-domain 负责模块检查自身的持久写入和发布关系。
