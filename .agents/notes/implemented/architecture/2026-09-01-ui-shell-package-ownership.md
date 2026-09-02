# Agent Note: UI shell package ownership

Status: implemented

English | [中文](2026-09-01-ui-shell-package-ownership.zh.md)

## Problem

The Web frame and its grid tracks need one package boundary that owns the persistent app rail, session panels, and later shell state. Package substitution and the visible rail behavior also need separate verification so regressions can be attributed to the correct change. Copying `@deepseek-ai/dsh-client-ui-layout` while leaving both packages visible to compile time catalog scanning creates duplicate slot declarations and ambiguous owner prop types even when the old bundle row is disabled.

## Decision

`@deepseek-ai/dsh-client-ui-shell` owns the shipped Web frame and is mounted in place of `ui-layout`. The `ui-layout` row remains present but disabled, which keeps the substitution explicit and patchable. The package owns the root registration and declares `app.rail`, `sidebar`, `conversation`, `details`, and `shell.overlay`. The root-scoped single `app.rail` has an empty owner share and renders in a fixed 72px leftmost track, keeping app navigation present while the session sidebar collapses. Both absolute drag handles add the rail width to their frame-left positions. The public client face exports `LayoutController`, `ILayout`, and the four owner prop interfaces.

The client catalog excludes `packages/client/ui-layout/src/**` before both slot contract scanning and exported type indexing. The exclusion represents the shipped bundle substitution rather than weakening duplicate detection. A focused generator test proves that an excluded replacement cannot contribute duplicate declarations or make owner types ambiguous, and a real Loader composition test proves the new package row mounts from `cordis.yml`.

## Alternatives considered

**Change `ui-layout` in place.** This would keep the current name attached to a package whose responsibility expands from panel geometry into native shell ownership, and rail regressions would be harder to distinguish from package substitution defects.

**Mount both packages.** Both packages register the root frame and declare the same child slots, so activation order would decide ownership and the compile time catalog would correctly reject the duplicate contracts.

**Allow duplicate declarations in the catalog.** Choosing one declaration silently would hide a real ownership conflict and could teach dynamic plugins the contract from a package that the shipped bundle does not mount.

## Consequences

The shipped Web surface uses `ui-shell` and reserves 72px for persistent app navigation independently of session panel geometry. Drag handles remain aligned with the visible sidebar and details boundaries because their absolute positions include the rail width. The old package remains available for explicit overlays, but the generated catalog documents the shipped default composition and therefore excludes an overlay that deliberately re-enables `ui-layout`. Duplicate declarations among active catalog sources still fail closed.
