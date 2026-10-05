# Agent Note: Required input admission and durable peer recovery

Status: implemented

[English](2026-10-03-required-input-admission.md) | 中文

## 问题

持久化的 peer inbox 工作可能比可选 collaboration 插件存活更久。来源声明验证数据，但不要求运行时权限所有者存在。没有 collaboration 监听器的恢复 Agent 原本会在下一个人工提示唤醒时把该工作发送给模型。普通 waterfall 拒绝还会停止 driver，使后续人工提示继续排队。投递恢复需要唤醒已有持久消息，而人工输入可能在接收方最后的 flush 或确认等待期间到达。

## 决策

消息来源元数据可以要求指定名称的准入策略。AgentRegistry 拥有可逆的策略注册；agent-loop 在 pre-step 之后和异步请求准备之后，检查最初领取及下游准入的消息。当前回合保留的要求不能通过改写来源或替换可见历史移除。策略缺失或已卸载时不会发起模型请求。策略拒绝记录一个 blocked 回合，并进入现有待处理输入排空流程，因此已排队的人工提示无需再次唤醒即可运行。普通监听器拒绝保留原有语义。

`Agent.wake()` 调度已有待处理输入，在 maintenance 期间等待，在 disposed 取消之后或没有输入时不执行工作。`Inbox.move()` 为已有身份记录一次重排 splice，不发布插入或丢弃通知。Collaboration 在 maintenance 内使用这些所有者方法，使人工 FIFO 排在 peer FIFO 之前，并保留中性上下文的位置。最终排序与唤醒同步执行。原始 inbox 回执投影按 peer 消息身份去重重排行。

Collaboration 先提交 outbox 和激活预留，再追加带归属的接收方输入、flush 接收方持久化、确认准入并唤醒待处理工作。恢复将接收方自身非继承回执与精确待处理身份核对，包括唤醒被中断的已准入行，不重复扣减激活预算。固定策略对新输入检查精确来源、内容、接收方、已提交准入及当前会话对授权。现有 Session 事件区分 pending、claimed、started、consumed、refused 和 cancelled 回执。已启动回合在暂停或断开连接后继续，但策略缺失或卸载仍会拒绝。在监听器能修改领取数组之前保存原始权限分类。持久接受回执不代表助手完成或人工批准。

策略可以在领取前或持久用户准入前的准备期间同步返回 `'defer'`。内部 inbox 领取跳过待处理的延后身份；后续延后通过现有持久 splice 恢复原始领取的身份、内容、列表及位置，不发布插入或取消通知。人工 FIFO 与 peer FIFO 保留，现有所有者唤醒恢复保留的领取，不重复扣减激活额度。回执 fold 恢复 `pending`；仅有确证的终态 refused 或 cancelled 输入才把已准入行结算为 failed。实际请求检查仍要求 `true`。这些内部修改不可缺少，因为 pre-step 和请求准备在持久领取后等待。它们不增加公开 Inbox 成员或 Session 事件；可重建的回执缓存推进版本。

循环为当前回合保留的必要输入注册 Agent 作用域内的 executor guard。响应等待期间 collaboration 卸载可能移除自身守卫，所以请求前检查和插件清理无法单独约束该响应的工具。保留的检查在必要策略不可用时拒绝 native 与 alternate dispatch。回合完成释放输入，Agent 作用域清理释放守卫；后续人工回合和重新挂载不会继承孤立拒绝。

Collaboration 通过现有聚合和系统拥有的 `delivery-status` 操作提交有限诊断枚举，包括成功解析后的显式清除。普通 resolver 的 `session/not-found` 及其表示 subagent 归属的 `session/agent-busy` 使排队投递失败；resolver 不可用、内部失败和未知异常保持可重试。已准入历史和计费在解析失败后保留，因为这种失败不提供终态输入拒绝的证据。人工视图和模型 status 读取同一已提交原因。相同重试保留接受身份与预算，不变失败不继续追加 journal。原始异常文本留在共享记录之外。可选原因字段保留旧聚合行与重放；旧读取器拒绝新操作。诊断新增不改变 Session 持久化清单。

声明的来源联合类型影响四个持久消息根。相邻 V3-to-V4 包增加严格策略验证，同时保留事件载荷、身份、坐标和继承边界。JSONL 发布带版本名的后继文件，不修改前代。实际发布发生之前，最新发布格式记录仍为 V3。

## 考虑过的替代方案

**仅使用插件 pre-step 监听器。** 缺失的插件没有监听器，无法拒绝恢复后的 peer 输入。提示词文本也不能强制准入。

**统一拒绝未知来源。** 这会改变无关来源的扩展与普通恢复。显式要求的策略元数据将拒绝限制在声明该要求的输入所有者。

**取消后重新插入待处理 peer。** 普通 splice 移除会发布取消和新插入通知。内部 restore 和重排保留同一输入及其真实生命周期。

**增加调度器或数据库。** 现有 driver wake、空闲 maintenance、inbox 投影和 storage-domain 事务已经拥有这些职责。新增方法仅暴露这些所有者缺少的操作。

## 影响

该功能增加共享运行时 API 和相邻格式依赖，提高了上游集成成本。升级检查也保留内部恢复和 Agent 作用域内的 executor 检查。验证覆盖策略缺失或卸载、native 或 alternate 调用等待时卸载、重新挂载和后续人工工作、来源改写、pre-step/request/prepareCall 期间暂停、持久重建、真实终态结算、人工与 peer FIFO、稳定重试诊断、延迟唤醒、自有与继承回执及前代文件保持不变。只有确认这些行为继续成立后，才能用上游等价实现替换本地扩展。

该机制不隔离任意 Host 代码，也不把同用户进程认证为人类。Collaboration 仍仅支持讨论。带版本名的录制会话后继文件及两种 SDK 预期输出必须随当前写入方维护；保留旧代不提供降级支持。
