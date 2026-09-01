# Agent Note: UI shell package ownership

Status: implemented

English | [中文](2026-09-01-ui-shell-package-ownership.zh.md)

## Problem

The Web frame and its grid tracks lived in `@deepseek-ai/dsh-client-ui-layout`. A native shell needs one package boundary that can own the frame, its persistent rail, and later shell state without mixing that architectural move with a visible layout change. Copying the package while leaving both packages visible to compile time catalog scanning creates duplicate slot declarations and ambiguous owner prop types even when the old bundle row is disabled.

## Decision

`@deepseek-ai/dsh-client-ui-shell` is an exact behavior fork of `ui-layout` and is mounted in its place by the shipped Web bundle. The `ui-layout` row remains present but disabled, which keeps the substitution explicit and patchable. The new package owns the root registration and declares `sidebar`, `conversation`, `details`, and `shell.overlay`; its public client face exports `LayoutController`, `ILayout`, and the three owner prop interfaces.

The client catalog excludes `packages/client/ui-layout/src/**` before both slot contract scanning and exported type indexing. The exclusion represents the shipped bundle substitution rather than weakening duplicate detection. A focused generator test proves that an excluded replacement cannot contribute duplicate declarations or make owner types ambiguous, and a real Loader composition test proves the new package row mounts from `cordis.yml`.

## Alternatives considered

**Change `ui-layout` in place.** This would keep the current name attached to a package whose responsibility is expanding from panel geometry into native shell ownership, and later app rail work would obscure whether a regression came from the package move or the new behavior.

**Mount both packages.** Both packages register the root frame and declare the same child slots, so activation order would decide ownership and the compile time catalog would correctly reject the duplicate contracts.

**Allow duplicate declarations in the catalog.** Choosing one declaration silently would hide a real ownership conflict and could teach dynamic plugins the contract from a package that the shipped bundle does not mount.

## Consequences

The shipped Web surface changes package identity without changing frame behavior, and later shell work has a dedicated owner. The old package remains available for explicit overlays, but the generated catalog documents the shipped default composition and therefore excludes an overlay that deliberately re-enables `ui-layout`. Duplicate declarations among active catalog sources still fail closed.
