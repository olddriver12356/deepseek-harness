# Agent Note: UI shell package ownership

Status: implemented

English | [中文](2026-09-01-ui-shell-package-ownership.zh.md)

## Problem

The Web frame and its grid tracks need one package boundary that owns the persistent app rail, session panels, and later shell state. Package substitution and the visible rail behavior also need separate verification so regressions can be attributed to the correct change. Copying `@deepseek-ai/dsh-client-ui-layout` while leaving both packages visible to compile time catalog scanning creates duplicate slot declarations and ambiguous owner prop types even when the old bundle row is disabled.

## Decision

`@deepseek-ai/dsh-client-ui-shell` owns the shipped Web frame and is mounted in place of `ui-layout`. The `ui-layout` row remains present but disabled, which keeps the substitution explicit and patchable. The package owns the root registration and declares `app.rail`, `sidebar`, `conversation`, `details`, and `shell.overlay`. The root-scoped single `app.rail` has an empty owner share and renders in a fixed 72px leftmost track, keeping app navigation present while the session sidebar collapses. Both absolute drag handles add the rail width to their frame-left positions. The public client face exports `LayoutController`, `ILayout`, `AppPanelsController`, `IAppPanels`, `PanelId`, and the four owner prop interfaces.

`ctx.appPanels` owns only active app-panel visibility. Its closed `PanelId` set is `agent`, `knowledge`, `experts`, `styles`, `monitor`, and `news`, with `agent` active initially. Its `getSnapshot` and `subscribe` methods form a React `useSyncExternalStore` observable; same-value writes do not notify, and unsubscription removes the listener. Slot declarations and registration lifecycles remain the render-authority mechanism, so visibility changes neither elect occupants nor unmount panel state.

The client catalog excludes `packages/client/ui-layout/src/**` before both slot contract scanning and exported type indexing. The exclusion represents the shipped bundle substitution rather than weakening duplicate detection. A focused generator test proves that an excluded replacement cannot contribute duplicate declarations or make owner types ambiguous, a real Loader composition test proves the new package row mounts from `cordis.yml`, and client composition coverage proves `ctx.appPanels` appears and disappears with the shell fiber.

The shell follows the adapter layering in [Session and Conversation ownership](2026-08-20-client-session-conversation-ownership.md). `ui-renderer` owns the registry, `client/store` owns layout storage, and `ui-session` supplies Session hooks. Strict `details` and `shell.activity` bodies render through `SessionProvider` with ordinary React children, so an absent Session never renders consumers that require its identity. Activity reads the current Session's single effective pending item through `useSessionPendingInteraction`; Monitor reads views through `useConversation`, not the Session status snapshot. The no-session regression covers selection and deselection and fails when the providers are absent.

## Alternatives considered

**Change `ui-layout` in place.** This would keep the current name attached to a package whose responsibility expands from panel geometry into native shell ownership, and rail regressions would be harder to distinguish from package substitution defects.

**Mount both packages.** Both packages register the root frame and declare the same child slots, so activation order would decide ownership and the compile time catalog would correctly reject the duplicate contracts.

**Use slot registration as active-panel election.** This would conflate shell visibility with render authority, remount panel components on selection, and discard their local state.

**Allow duplicate declarations in the catalog.** Choosing one declaration silently would hide a real ownership conflict and could teach dynamic plugins the contract from a package that the shipped bundle does not mount.

## Consequences

The shipped Web surface uses `ui-shell` and reserves 72px for persistent app navigation independently of session panel geometry. Drag handles remain aligned with the visible sidebar and details boundaries because their absolute positions include the rail width. App-panel selection is transient and starts at `agent`, while mounted panels can preserve local state across visibility changes. The old package remains available for explicit overlays, but the generated catalog documents the shipped default composition and therefore excludes an overlay that deliberately re-enables `ui-layout`. Duplicate declarations among active catalog sources still fail closed.
