# Agent Note: Vault-backed Expert Methods

Status: implemented

English | [中文](2026-09-06-vault-backed-expert-methods.zh.md)

## Problem

The Experts page rendered a static fixture and discarded every create, edit, delete, and dispatch action. It described local Markdown persistence without owning a Host capability, and an Expert could not participate in a real Session.

The target Vault already owns an Agent Layer Method registry with stable artifact identities and an owner-approval gate. Creating a second Expert store under the Harness home would split authority and bypass that approval contract.

## Decision

`@deepseek-ai/dsh-host-experts` owns the `experts` Remote and stores Expert definitions as `artifact_type: Method` packages under `<vaultRoot>/Agents/5 Methods/Experts/<title>/ARTIFACT.md`, distinguished by `method_kind: Expert`. The web bundle supplies a portable environment-or-working-directory default, while a profile may set its machine-local Vault root explicitly.

The Host validates filesystem-safe titles, confines resolved packages to the Experts root, writes through a temporary file and rename, serializes mutations, runs the Vault sync guard before mutation, and rebuilds Agent Layer derived state after mutation. Deletion refuses a package containing anything other than the managed `ARTIFACT.md`.

The page lists every Expert status for review. Only `approved` records can dispatch; draft and suspended records remain visible but disabled. Approval maps to `owner_approved`, so Agent Layer's existing Method registry remains the executable eligibility authority.

Dispatch uses the selected Client Session's existing `beginSubmission` and `prompt` path. The complete Expert instructions, optional style, and task become one ordinary logged user message. The first implementation inherits the current Session's model, reasoning, tools, skills, permission, workspace, and context. Stored capability fields are descriptive and do not silently expand or replace runtime authority.

## Alternatives considered

**Keep fixtures and add browser-local state.** This would make the buttons appear functional but would lose records on reload and retain two authorities, so it does not satisfy Vault integration.

**Store Experts under the Harness home.** A Harness-owned directory would be simpler for the Host, but it would bypass the Vault's Agent Layer identity, approval, registry, sync guard, and cross-agent visibility.

**Create a new `Expert` artifact type.** Agent Layer v1 already executes `Method` and `Workflow`. Adding a third executable type would require schema, validator, registry, and dispatcher expansion even though an Expert is currently only a reusable instruction method.

**Apply model, permission, skills, and tools during dispatch.** The current UI path has no single verified operation that atomically applies those capabilities to a Session. Treating metadata as enforcement would misrepresent authority, so runtime application is deferred.

**Dispatch through a subagent by default.** Original Boujoy Experts run in the current Agent, and isolation changes context, lifecycle, cost, and tool ownership. A future subagent mode must be explicit rather than hidden behind the same button.

## Consequences

Expert CRUD now survives reloads as Vault Markdown and remains visible to every Vault-aware agent. Approved dispatches enter the normal Session lifecycle and can be reconstructed from its log. The implementation reuses the existing Method registry instead of adding another executable catalog.

The Host currently depends on the Vault's PowerShell sync guard and AgentLayer rebuild scripts for mutation safety, so a configured Vault without those scripts cannot mutate Experts. Capability metadata remains documentation until dedicated Session APIs can enforce it. Deletion is intentionally conservative and requires manual handling when a package gains evidence or other unmanaged files.

## Testing

Host tests pin Agent artifact parsing and directory-title integrity. Client tests pin asynchronous Vault listing, approved-only dispatch, filtering, panel persistence, and create/reload behavior. Host contract generation, Client typecheck, focused tests, and the assembled browser bundles cover the package and Remote boundaries.
