# Agent Note：中文个人理解与用户审核的整理

Status: implemented

[English](2026-10-01-personal-understanding-compaction.md) | 中文

## Problem

用户希望关于我中的所有理解都是中文，希望把相似理解合并为一条原子理解，并发现理解图谱节点较多时会被裁切。原版 Bok 页面没有合并操作，而 Agent 通过 `bok_person_context` 逐条读取理解，因此近似重复和英文表述会传给每个使用者。

## Decision

新表述在写入时即为中文。Host 拒绝 `candidate_statement` 不是以 `用户` 开头的简体中文的 `bok_observe_conversation` 信号，观察器的提取提示词也要求这一格式。该检查位于 DSH 桥接层，固定版本的 Bok 引擎保持不变。

已有理解由用户手动发起整理，而非后台任务。可选的 `compaction` 配置启用 **整理理解** 弹窗，说明将发送的理解数量及其中私密理解数量，并排除敏感理解。沿 `agentDefaultModel` 路由发送一次请求，返回 JSON 格式的合并与翻译。Python 桥接层校验 id、重复、分组字段和中文前缀后保存提议。用户逐张勾选卡片。应用前先备份，拒绝已变化的理解，并只应用已保存的表述：翻译调用 Bok 的 `correct`；合并对第一条调用 `supersede`，使其余理解失效并指向替代项，同时复制其来源引用。每条原始理解都留在 Bok 历史中，用户可以审计或恢复。

整理请求不属于任何 Session，因此模型可见输入改在 Personal Core 中记录：`.bok/dsh-compaction/<id>.request.json` 在发送前保存完整请求，提议与结果文件位于其旁。这与观察器对应；观察器请求属于 Session，因此记录为 session event。

每个理解分组紧贴其自身理解环外侧，边保持较短。图谱是无边界画布：拖动即可平移，初始居中，拖动不会打开理解，大型图谱无需缩小标签或滚动条即可完整访问。

## Constraints

图谱修改位于 vendored 浏览器脚本和样式表；弹窗位于 DSH 自有的 `dsh-compaction.js`。合并不会跨越理解类型、范围或敏感级别，因此不会扩大访问范围或改变分类。纠正和取代会把结果标记为用户确认；逐卡审核提供这一确认。每个提议只能应用一次；某项失败时停止，之前的项保持已应用，并与备份 id 一起记录。

## Verification

Loader 组合测试通过真实工具路径写入理解，拒绝非中文信号，并检查摘要计数、未知 id、跨分组合并、非中文表述、带代码围栏的有效提议、实际模型路由与已保存请求、越界选择、只应用合并而不影响未勾选翻译、重复应用、之后纠正导致的过期提议，以及插件卸载后的 404。

## Alternatives considered

只在显示层分组会让 Agent 继续读取重复理解。从浏览器调用 Bok 管理员路由 `claims/propose` 需要放宽上游路由白名单。不经询问发送私密理解与其分类冲突，因此每次运行都由弹窗询问。

## Consequences

每次整理消耗一次受配置限额约束的模型请求。合并后的理解携带合并的来源引用，上限为 Bok 的 50 条。相关集成决策见 [Bok Personal Core note](2026-09-18-bok-personal-core.zh.md)。
