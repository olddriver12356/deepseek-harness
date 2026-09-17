# Agent Note: Preserve the local shell across upstream integration

Status: implemented

English | [中文](2026-09-16-local-shell-upstream-integration.zh.md)

## Problem

The local application rail and Live Signal used the previous layout contract. Upstream now owns global main panels, a docked right sidebar, and root-scoped overlays. Combining the branches without adapting these contracts prevents the browser from starting or hides local pages.

## Decision

Keep the local shell as the Web root and share upstream geometry, navigation, store, and title behavior through `ui-layout-core`. Preserve the upstream `main`, `rightbar`, and root overlay seats. Local pages use a separate session-optional `shell.app-overlay` seat, rendered even when no session is selected. Live Signal keeps its independent icon-only collapse control.

Keep local Apps, Knowledge, News, Skills, Experts, Styles, Chinese navigation, protected assets, and distillation drafts. Mount each generated Remote contribution once. Disable session-log upload explicitly in the base profile. Verification uses disposable data and does not migrate the owner's existing sessions.

## Alternatives considered

Replacing the local root with the upstream root would remove approved local navigation and Live Signal behavior. Copying the upstream layout implementation into both packages would duplicate its state and geometry rules.

## Consequences

Both layout providers depend on the shared browser module. A composition must activate that module before either provider. Existing running installations require rebuilding and restarting to use the merged source. Historical local implementation documents remain preserved in the owner's vault attachments.

## Testing

Focused integration tests cover local panels, layout, workspace navigation, protected assets, launcher processes, Knowledge, and Ponytail. The Remote assembly test rejects duplicate mounts. The shell regression verifies local overlays remain mounted without a selected session. Isolated browser verification exercises the composed Web profile. The vault integration report records exact build, audit, and documentation-gate results, including unresolved pre-existing documentation debt.
