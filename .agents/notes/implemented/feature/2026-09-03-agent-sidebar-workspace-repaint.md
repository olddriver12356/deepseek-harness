# Agent Note: Agent sidebar and Workspace browser repaint

Status: implemented

English | [中文](2026-09-03-agent-sidebar-workspace-repaint.zh.md)

## Problem

The Agent sidebar and Workspace browser exposed the native multi-workspace Session model, but their presentation did not establish the product hierarchy shown by the approved Boujoy direction. The surface lacked the `PROJECT TAPE` and Session-tape treatments, a total Session count, paired primary actions, a current Workspace indicator, and a main-list loading state. At phone widths, expanding the sidebar still consumed a grid track instead of overlaying the center surface.

The existing `dsh.workspace.view.v5` store contains valid presentation state for Session ordering and recency. The grouped multi-workspace browser is also the accepted product structure, so visual fidelity could not justify replacing either one with a new state model or a single-workspace tape.

## Decision

Keep the existing `ui-workspace` state and grouped browser. Add an Agent-specific palette and display-font alias under `--dsw-specific-agent-*`, then use those tokens to repaint `ui-sidebar`, the Workspace chrome, and its rows with the approved high-contrast tape, offset-shadow, and texture language while preserving DSH focus, hover, disabled, and reduced-motion behavior.

Make `ui-workspace` own the expanded primary-action pair, `PROJECT TAPE`, total Session count, current Workspace strip, Session-tape heading, corrected search copy, and list skeleton. Derive the current Workspace from the current Session's membership, falling back to `recentWorkspaceId` only when there is no current Session. Reuse one `WorkspacePickFlow` instance for both Add Workspace and the current Workspace menu so only one directory-flow owner is mounted.

Make `ui-shell` own the phone drawer because it owns the grid tracks and panel width. At viewports up to 820 pixels, keep the explicit sidebar grid track at 56 pixels and render the same sidebar occupant as an approximately 280-pixel absolute overlay when expanded. Keep the center in its original grid column and omit the sidebar resize handle in drawer mode.

Do not add Refresh. Native Session and Workspace projections already stream changes, and there is no refresh operation with distinct product semantics. Do not add Session Delete because native delete-to-trash remains unavailable.

## Alternatives considered

**Replace the grouped browser with a current-Workspace-only tape.** Rejected because the approved composition keeps multi-workspace grouping and treats the new current Workspace strip as an indicator above it.

**Let `ui-sidebar` implement phone positioning.** Rejected because that package receives width and collapsed state but does not own the surrounding grid or center-column geometry. Overlay behavior there would couple a child to layout assumptions it cannot enforce.

**Mount separate Workspace pickers for Add and Select.** Rejected because each picker can own the same directory flow. One mode-driven picker provides both entry points without duplicate ownership or state.

**Add a decorative Refresh button.** Rejected because it would imply a manual consistency boundary that does not exist and would require inventing behavior beyond the native projections.

## Consequences

The expanded Agent column now has a package-scoped Boujoy treatment and a clear hierarchy while the collapsed rail keeps its existing New Session shortcut. The Workspace browser still supports grouped and flat views, search, drag ordering, archive, rename, and fork through the same native contracts and presentation store.

The main list no longer presents a false empty state while either projection is pending. The current Workspace menu and Add Workspace action share one picker lifecycle, and starting a Session from the paired action uses the derived current Workspace when available.

At phone widths, opening the sidebar no longer changes the 56-pixel grid track or shrinks the center column. The expanded occupant overlays the center with a shadow, retains its ordinary component tree and state, and has no resize affordance until the layout leaves drawer mode.

Refresh remains intentionally absent. If native projections later gain a real retry or resynchronization contract, that operation can be surfaced with honest loading and error feedback rather than a visual-only control.
