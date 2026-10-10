# Agent Note: Session Discussion UI and Durable Attribution

Status: implemented

## Problem

V1a needs human management of ordinary Session discussion pairs within the existing UI. Peer record grants cannot define the human control list: a pair whose snapshot and follow grants are both false still needs pause, budget and disconnect controls. Adding a custom Peer Conversation Definition alone also produces a second generic context node, because the assembler dispatches every matching Definition. Finally, a downstream pre-step listener could rewrite a required-policy input source to `user`; the ordinary opening history page may omit its original Inbox event, so presentation cannot reconstruct truthful attribution from the loaded window.

## Decision

The optional `ui-collaboration` browser package contributes a Portal to `shell.activity.selectors`, a store-free wrapper to `shell.app-overlay` and a keyed Peer renderer. The wrapper mounts the strict Session child slot `collaboration.board` only after a Session is selected. Registering a scoped store directly on the optional Session overlay caused blank-shell mounting to fail before the user could select a Session. Portal and Board now share one renderer-managed Session store handle for local drafts, selection, visibility and reading positions. No shell background, parent component or core renderer changes are required. The committed Remote view remains solely in the data owner.

Host `controlSnapshot` and `controlFollow` return identical complete human management projections: selected Session-owned connections, endpoint registrations and observations, and explicitly shared outbox records irrespective of peer grants. The existing peer `snapshot`, `follow` and model status keep their exact filters. Both stream forms reuse the same committed-store notification, coalescing and disposal implementation. Observations use stored headers, the existing Agent registry without resolution, and native read-only Git metadata; absent or malformed facts remain unavailable.

Chat owns a reversible source-kind exclusion contribution, `chatInputs.excludeSource`. Its registry roster rebuild runs in a queued owner callback, outside a departing contributor's effect, and is cancelled when Chat unloads. The Peer plugin owns its Definition and renderer. Disposal removes Peer ownership and restores generic attributed context rendering without changing ordinary humans.

AgentLoop's existing pre-step capture already retains original required-policy inputs before listeners. At the first durable append of each step, an ephemeral identity map chooses the earliest required-policy source for each exact message ID while preserving transformed content. The actual request derives those appended messages from Session history. No history lookup, persistent cache, new Session field or format migration is needed. Inputs without an original required policy retain their previous behavior.

The Client DTO boundary uses pure record/request/source schemas and SessionId from `/types`. Runtime domain, projection and capability code stays in Host modules. Type-only imports previously crossed through receipt projection and Host root Context augmentations, incorrectly turning browser `ctx.sessions` into `SessionStore`. Explicit source schema ID annotations keep the emitted declarations on the safe type face. The private WeakSet mint/check and full journal replay consistency validation remain intact.

## Alternatives considered

Reconstructing original source from Inbox predecessors was insufficient for truncated opening windows. Widening history pages through new source-event tracking or downgrading historical humans would change unrelated history behavior. Preserving required-policy attribution at the existing durable append boundary solves the actual defect directly. Giving the UI a union of grant-filtered snapshots and follow streams would retain or lose control rows incorrectly, so the UI consumes one complete human management generation.

## Consequences

The same-user Host/Gateway limitation remains Prerequisite P. This work does not claim action-authority isolation or an unforgeable human channel. It supplies no plans, tasks or execution controls. Focused tests cover the management grant matrix, disconnect replacements, native metadata unknowns, terminal stream replacement, stale refresh, transformed-source persistence and actual model requests, production Loader/renderer composition, truncated-window Peer rendering, cross-slot state, cancellation/focus restoration and unload/remount fallback. Task 10 owns assembled replay, the recorded manifest, exported-entry smoke and the one combined GUI gate.
