# @deepseek-ai/dsh-client-ui-app-rail

English | [中文](README.zh.md)

App rail plugin: persistent six-entry navigation occupant for the `app.rail` slot, driving active panel selection through `ctx.appPanels` without managing panel content or lifecycle. AppRail reads the active panel ID via `useSyncExternalStore`, renders six hardcoded entries (agent, knowledge, experts, styles, monitor, news in order), marks the active entry with `aria-selected`, and calls `ctx.appPanels.setActive(id)` on click. The component owns visibility only; panel registration and occupancy remain separate concerns managed by `ctx.slots`.

AppRail consumes `ctx.appPanels` injected from `@deepseek-ai/dsh-client-ui-shell/client` and registers itself into the `app.rail` slot declared by that shell package. Later panel packages register into `shell.overlay` and read the same `ctx.appPanels` service to discover active state, creating a single source of truth for active panel identity across the UI without hard coupling between rail and panel implementations.

`/client` exports plugin body (`apply`/`inject`), `RailEntry` (entry row structure). AppRail component remains package-internal for testability.

## Model Experience

None, as the rail occupant owns visibility and selection only; nothing reaches a model request.

#### KV Cache effect

None; package neither assembles nor sends provider request.

## Known Limitations and Deferred Work

- **No roving tabindex**: rail entries render as stateless buttons. Arrow-key navigation deferred until Task 5 when panel pages exist.
- **No aria-controls**: tab-like `aria-selected` markup describes active state only. `aria-controls` links to panel content IDs deferred until panel registration stabilizes.
- **Minimal tab semantics**: tab role declares navigation intent, but full tab panel coupling remains future work.
- **Selection never remounts panel**: panel state persists across visibility changes because selection affects `ctx.appPanels` snapshot only, not slot occupancy or component lifecycle.
