# Agent Note: Agent composer Boujoy repaint

Status: implemented

English | [中文](2026-09-03-agent-composer-repaint.zh.md)

## Problem

The Agent composer already routed draft, image, permission, plan, model, send, stop, queue, and steer behavior through native session and projection faces, but its neutral capsule presentation did not match the approved Boujoy direction. Several native capabilities were also hard to discover: image intake depended on paste, drag, or command surfaces, running-state queue versus steer behavior was visible only through keyboard semantics, and attachment context rendered inside the input card instead of above it.

The source-fidelity target also shows an agent preset select in the active composer. DSH intentionally permits preset selection only before the first turn because the Host refuses to swap a session's tool composition after history exists. Duplicating that control in the active composer would create an affordance that is invalid for most of its lifetime.

## Decision

Keep `useProjection`, the input machine, `SessionFace.prompt`, `SessionFace.cancel`, the permission command path, and every existing slot owner unchanged. Add a `--dsw-specific-composer-*` palette and display-font alias, then apply those tokens to the composer card, permission trigger, plan chip, model trigger, attachment rail, and pre-session preset chip.

Move the existing attachment slot above the card without changing its owner share or intake callbacks. Add a native hidden multi-file input accepting PNG, JPEG, WebP, and GIF, and route its files through the existing `intakeImages` validation and `addImages` face. Keep paste and drag intake unchanged.

When a root session is running, render a compact busy status above the card. It shows `任务运行中` and both queue and steer labels, with the current Enter behavior derived from the existing `resolveSubmitMode` policy. The status does not own a second preference or change submission behavior. Existing Enter and Cmd/Ctrl+Enter semantics remain authoritative.

Use the exact Chinese prompt copy `描述你要完成的事…`, localize the three known permission values, and show `读取模型…` while the native model directory is loading. Preserve the existing explicit acknowledgement dialog for Full access and its cancel reversion.

Keep the agent preset in the pre-session hero context row. Repaint it as an above-card context chip, but do not add a second active-session select that the Host cannot honor.

## Alternatives considered

**Create a separate composer state for queue and steer.** Rejected because the submission policy already owns the preference and resolves each keyboard gesture. A second local state would drift from the native setting.

**Replace the command button with image attachment.** Rejected because command discovery is existing DSH functionality. A neighboring native file button exposes image intake without removing the command surface.

**Add an active-session preset selector.** Rejected because preset changes are valid only before the first turn. The existing hero selector is the honest lifecycle boundary.

**Duplicate image validation in the file input.** Rejected because `intakeImages` already applies the projected count, media-type, per-file, and aggregate limits before using `addImages`.

## Consequences

The composer now presents one coherent Boujoy editorial surface with sharp tape edges, grid texture, offset color shadows, and distinct send and stop treatments while preserving shared DSH focus, disabled, error, and reduced-motion states.

Attachments and context appear above the card. Users can select multiple supported images directly, and the same validation, preview, removal, paste, drag, and submission paths continue to operate.

Running sessions expose the existing queue or steer Enter behavior as status rather than hidden keyboard knowledge. No new setting, projection, session store, or transport path was introduced.

The source preset placement is intentionally adapted to DSH lifecycle semantics. The composer does not imply that an active session can swap its tool composition.
