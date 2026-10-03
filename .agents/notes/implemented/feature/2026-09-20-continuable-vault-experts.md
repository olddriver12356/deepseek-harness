# Agent Note: Continuable Vault Experts

Status: implemented

English | [中文](2026-09-20-continuable-vault-experts.zh.md)

## Problem

Delegated Experts waited for a one-shot result, offered no direct panel action, and had no enforced read-only setting. The generic subagent runtime already supported durable children, follow-ups and authorized interruption.

## Decision

`dispatch_expert` resolves an approved record and calls `startContinuable`. It returns an admission receipt containing the child and parent session ids. The existing continuation service delivers settlement notices, handles follow-ups and reconstructs cold children. The task card opens the addressed child and uses the existing interruption Remote. Admission is distinct from acceptance; the parent verifies the report.

Expert records default to fresh context and read-only access. Fork context is explicit. The Host snapshots an allowlist intersected with the parent's visible tools into `experts/delegation`; its projection restores the same tool authority. An agent creation listener installs a final monotonic execution guard and native presentation. Schema filtering improves the model's choices but is not the enforcement mechanism. Scoped tool registrations also pass through the guard. Writable experts add configured mutation tools and retain inherited sandbox and approval restrictions.

The Host bounds initial dispatch to two running or starting expert children per parent by default. Startup reservations release on acceptance or failure. Follow-up turns remain owned by the existing continuation service. Only top-level agents can dispatch experts; the default allowlists omit delegation and runtime reconfiguration tools.

## Alternatives considered

**A second team scheduler.** Rejected because the existing continuation lifecycle already owns durable ids, notices, cancellation and message routing.

**Prompt-only read-only instructions or global tool filters.** Rejected because instructions do not enforce authority and the existing global filter does not restrict independently scoped registrations.

**Automatically fork every task.** Rejected because independent investigations do not need a copy of the parent conversation. The task brief carries goal, context, ownership and acceptance checks; explicit fork remains available.

## Consequences

Existing records without access or context fields start read-only with fresh context. No Vault records are rewritten automatically. Expert access is not filesystem isolation, and file ownership remains a task instruction. Automatic worktrees, file locks, persisted acceptance approvals and provider-selection UI are deferred. The Experts Host plugin is required when restoring expert children.

The Loader composition test exercises denied writes, permitted writes, scoped tool overrides, cold continuation and startup capacity. Component coverage verifies addressed navigation, stopping and admission wording. The public tool entry is explicitly bundled alongside the CRUD entry.
