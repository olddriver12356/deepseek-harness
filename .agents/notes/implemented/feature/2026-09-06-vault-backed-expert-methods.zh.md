# Agent Note: Vault-backed Expert Methods

Status: implemented

[English](2026-09-06-vault-backed-expert-methods.md) | 中文

## Problem

Experts 页面只渲染静态 fixture，并丢弃所有创建、编辑、删除和派发操作。页面声称使用本地 Markdown 持久化，却没有对应 Host capability，Expert 也无法进入真实 Session。

目标 Vault 已经拥有带稳定 artifact identity 和 owner approval gate 的 Agent Layer Method registry。如果在 Harness home 下建立第二套 Expert 存储，就会分裂 authority 并绕过现有批准契约。

## Decision

`@deepseek-ai/dsh-host-experts` 负责 `experts` Remote，并将 Expert 定义存储为 `<vaultRoot>/Agents/5 Methods/Experts/<title>/ARTIFACT.md` 下的 `artifact_type: Method` package，以 `method_kind: Expert` 区分。web bundle 提供可移植的环境变量或工作目录默认值，profile 可显式设置机器本地 Vault root。

Host 验证可安全用于文件系统的 title，将解析后的 package 限制在 Experts root 内，通过临时文件和 rename 写入，串行执行 mutation，在 mutation 前运行 Vault sync guard，并在 mutation 后 rebuild Agent Layer derived state。如果 package 除受管 `ARTIFACT.md` 外还有其他内容，删除会被拒绝。

页面列出所有 Expert status 以供审核。只有 `approved` record 可以派发；draft 和 suspended record 仍可见但不可调用。Approval 映射到 `owner_approved`，因此 Agent Layer 现有 Method registry 仍是 executable eligibility authority。

派发复用所选 Client Session 的 `beginSubmission` 和 `prompt` 路径。完整 Expert instructions、可选 style 和 task 会成为一条普通且已记录的 user message。第一版继承当前 Session 的 model、reasoning、tools、skills、permission、workspace 和 context。存储的 capability fields 仅用于描述，不会暗中扩大或替换 runtime authority。

## Alternatives considered

**保留 fixtures 并添加 browser-local state。** 这会让按钮看起来可用，但 reload 后记录消失，而且仍有两套 authority，因此不满足 Vault integration。

**将 Experts 存在 Harness home。** Host 实现会更简单，但它会绕过 Vault 的 Agent Layer identity、approval、registry、sync guard 和跨 agent 可见性。

**新增 `Expert` artifact type。** Agent Layer v1 已执行 `Method` 和 `Workflow`。Expert 目前只是可复用的 instruction method，增加第三种 executable type 会无谓扩大 schema、validator、registry 和 dispatcher。

**派发时应用 model、permission、skills 和 tools。** 当前 UI 路径没有一个已验证的原子操作可将这些 capability 应用到 Session。把 metadata 当成 enforcement 会误报 authority，因此 runtime application 延后。

**默认通过 subagent 派发。** 原始 Boujoy Experts 在当前 Agent 中运行，而 isolation 会改变 context、lifecycle、cost 和 tool ownership。未来 subagent mode 必须显式选择，不能藏在同一个按钮后面。

## Consequences

Expert CRUD 现在以 Vault Markdown 跨 reload 保存，并对每个 Vault-aware agent 可见。已批准的 dispatch 进入普通 Session lifecycle，可从 Session log 重建。实现复用现有 Method registry，没有增加第二套 executable catalog。

Host 当前依赖 Vault 的 PowerShell sync guard 和 AgentLayer rebuild scripts 来保证 mutation safety，因此缺少这些脚本的配置 Vault 不能修改 Experts。Capability metadata 在专用 Session APIs 可以强制执行前仍是说明信息。删除有意保持保守，package 一旦包含 evidence 或其他未托管文件，就需要人工处理。

## Testing

Host tests 固定 Agent artifact parsing 和 directory-title integrity。Client tests 固定异步 Vault listing、approved-only dispatch、filtering、panel persistence 和 create/reload behavior。Host contract generation、Client typecheck、focused tests 和 assembled browser bundles 覆盖 package 与 Remote boundaries。
