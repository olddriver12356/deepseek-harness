# Agent Note: Vault-backed Style Methods

Status: implemented

English | [中文](2026-09-06-vault-backed-style-methods.zh.md)

## Problem

Boujoy's Styles page (`04 风格`) never migrated: no host or client package existed, and the app rail's `styles` entry was an inert label. A Style in Boujoy is a plain-file record (name, description, instructions, enabled) used two ways: dispatched standalone into the Agent, or layered on top of an Expert dispatch as an output-voice overlay. `packages/client/ui-experts`'s dispatch dialog already carried a placeholder for the overlay concept, a `<select>` with two hardcoded options and no way to manage them.

## Decision

`@deepseek-ai/dsh-host-styles` owns `styles` Remote and stores Style definitions as `artifact_type: Method` packages under `<vaultRoot>/Agents/5 Methods/Styles/<title>/ARTIFACT.md`, distinguished by `method_kind: Style`. This mirrors `@deepseek-ai/dsh-host-experts` exactly: same validation, path confinement, write-through-temp-then-rename, Vault sync guard before mutation, and Agent Layer rebuild after mutation, so a Style is subject to the same owner-approval gate as an Expert before it can dispatch into a Session. A Style record is a strict subset of an Expert record, name, description, instructions, status, dropping category, model, reasoning, permission, and skills, since Boujoy's Style never carried those fields either.

`@deepseek-ai/dsh-client-ui-styles` mirrors `@deepseek-ai/dsh-client-ui-experts` package-for-package: same plugin shape (`inject`, `apply`, one `shell.overlay` registration), same dispatch path through `beginSubmission`/`prompt`, same CSS design tokens and layout, reusing the same `punk-collage-dark.png` background asset for visual parity. The Style card drops the Expert's avatar-letter treatment for a decorative swatch block, matching Boujoy's own `.style-swatch` element, since a Style has no natural single-letter identity the way a named Expert does.

`@deepseek-ai/dsh-api-remotes`'s client assembly (`packages/api/remotes/src/client/index.ts`) now imports and mounts `stylesRemote` alongside `expertsRemote`, the same central seat every other Host Remote registers through.

## Alternatives considered

**Wire the Expert dispatch dialog's style selector to read real Styles in this same change.** Deferred. It is real follow-up work, recorded as a known limitation in both README pairs, but it is a change to `ui-experts`, not part of migrating the Styles page itself, and folding it in here would have coupled two independently reviewable changes.

**Give Style records the same capability fields as Expert (model, reasoning, permission, skills).** Rejected. Boujoy's Style never carried them, and a Style's only runtime effect is prose folded into a prompt, so there is no descriptive-intent field to record.

## Consequences

Style CRUD now survives reloads and is visible to every Vault-aware agent, the same guarantee Experts already carry. Approved Style dispatches enter the normal Session lifecycle and can be reconstructed from its log. The Expert dispatch dialog's own style overlay remains a two-option placeholder until the follow-up wiring lands; that gap is now documented rather than silent.

## Testing

Host tests pin Style artifact parsing, directory-title integrity, and the friendly not-a-vault error. Client tests pin Vault listing, approved-only dispatch, filtering, panel persistence, and create/reload behavior, mirroring `ui-experts`'s test shape. `lint:contracts-ready`, `tsc -b` across the touched project graph, scoped vitest (12 new tests across `ui-styles` and `host/styles`, 29 total across the touched packages), and `check:ci:windows-blocking` (build 86.67s, production site 99.51s) all pass.
