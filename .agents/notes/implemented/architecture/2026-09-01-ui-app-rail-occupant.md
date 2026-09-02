# Agent Note: App rail occupant

Status: implemented

English | [中文](2026-09-01-ui-app-rail-occupant.zh.md)

## Problem

Navigation rail occupies a fixed leftmost screen track independent of sidebar or panel geometry. Six entries (agent, knowledge, experts, styles, monitor, news) select active panel by ID, but rail itself does not manage panel content, lifecycle, or ownership of the `ctx.appPanels` service. Package boundaries must keep rail selection separate from panel registration so regressions remain traceable and later panel packages can depend on shared active-panel state without circular dependency on rail.

## Decision

`@deepseek-ai/dsh-client-ui-app-rail` occupies the `app.rail` slot declared by `@deepseek-ai/dsh-client-ui-shell` and contributes AppRail component. AppRail reads `ctx.appPanels` through `useSyncExternalStore`, rendering one entry per panel ID (agent, knowledge, experts, styles, monitor, news hardcoded), marking active entry with `aria-selected`, and calling `ctx.appPanels.setActive(id)` on click. Rail exports no state of its own and declares no children in cordis.

`ctx.appPanels` ownership remains with `ui-shell` package; rail only consumes its snapshot. This separation allows later panel packages to register into `shell.overlay` (declared by `ui-shell`), read the same `ctx.appPanels` service, and discover active panel ID without importing or depending on the rail package.

Tab semantics minimal by design. `aria-selected` marks active state, but `aria-controls` linking to panel element IDs, roving tabindex arrow-key navigation, and tab panel coupling all defer to Task 5 when panel pages become concrete.

## Consequences

Rail remains a pure visibility selector, decoupled from panel lifecycle. Later task can add panel implementations into `shell.overlay` and read active state from `ctx.appPanels` directly, without changing rail package. Selection never remounts panel components; panel state persists across visibility changes. Tab role signals navigation intent without enforcing full tab panel semantics until panels exist.

## Alternatives considered

**Embed panel registration in rail package**: rail could manage both `app.rail` slot registration and panel container lifecycle, but this violates single responsibility and creates hard coupling between navigation UI and panel occupancy. Later packages registering new panels would depend on rail package details, making rail a required dependency for all panel implementations.

**Use a separate enum or context hook instead of `ctx.appPanels`**: a custom hook would centralize active-panel state but would miss the design that `ctx.appPanels` already owns this concern as a first-class service in `ui-shell`. Duplicating that intent across packages fragments the single source of truth and makes visibility changes not automatically propagate to all consumers.

**Render full tab panel semantics immediately**: adding `aria-controls`, roving tabindex, and panel coupling in Task 4 before concrete panel pages exist would over-specify a contract neither rail nor panels can satisfy yet. Deferring these until Task 5 when panel implementations exist keeps the rail honest about what it owns.

## Consequences

- **Roving tabindex navigation**: implement arrow-key cycling across rail entries once panel pages mount (Task 5).
- **aria-controls link**: establish tab-panel relationship with element ID pointers once panel IDs stable (Task 5).
- **Tab panel coupling**: full tab widget semantics (role nesting, `aria-label` scope) await concrete panel registration (Task 5).
