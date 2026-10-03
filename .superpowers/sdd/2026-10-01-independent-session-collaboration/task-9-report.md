# Task 9 implementation report

## Result and scope

Implemented the optional V1a discussion UI package, connection Portal, Board as discussion details and attributed Peer messages. Existing `shell.activity.selectors`, `shell.app-overlay` and keyed conversation renderer registrations provide the composition points. The shell implementation, application background and default base/web-app bundles have no changes. The feature supplies no plans, tasks, invitations, enrollment or execution controls. Both pair grants may be false. Human disclosure and an explicit activation limit, including zero, are required; drafts contain no numerical default.

Portal and Board use renderer-bound observable hooks and plain callbacks. Components receive no Cordis context. Local stores contain only drafts, selection and open state. The two differently scoped slot handles share one underlying per-Session local store. `data.ts` exclusively owns authoritative complete Remote generations, replacement across revision gaps, stale refresh rejection, terminal stream replacement and HMR disposal. Native dialog cancellation restores keyboard focus. English and Chinese copy is typed, and message content renders as inert text.

## Owner corrections and recorded rulings

Added `controlSnapshot` and `controlFollow` with identical complete human management semantics. They expose only the selected Session's owned pairs, endpoint labels and observations, and explicitly shared outbox records. Peer snapshot/follow grants do not hide human controls or shared discussion records. Existing model-facing `snapshot`, `follow` and `collaboration_status` retain their separate grant filters. Both stream projections reuse the existing committed store notification, coalescing and disposal lifecycle. Unrelated Session pairs and private Session histories are absent. Current cwd comes from Session metadata; availability observes the existing Agent registry without resolving or waking an Agent. Native filesystem Git observation reports unavailable or detached states truthfully.

Generic Chat now owns an effect-scoped source-kind exclusion contribution. Peer supplies the actual Definition and renderer; the assembler dispatch mechanism is unchanged. Definition roster rebuilding runs in a queued owner callback because a synchronous callback during contributor disposal inherited the departing effect and produced `INACTIVE_EFFECT`. The queued callback is cancelled on Chat disposal. Removing Peer restores one generic attributed context node and leaves ordinary human messages unchanged.

Original Inbox reconstruction was insufficient: normal opening history windows can omit the predecessor Inbox event. The approved correction uses AgentLoop's existing capture of required-policy inputs before listeners. The first durable append retains the earliest original required-policy source for each exact claimed message ID and preserves transformed content. Later policy entries cannot replace that original source. Inputs with no original required policy preserve existing behavior. There is no new Session field, source cache, history lookup, expanded pagination or format version. Provisional Inbox reconstruction code was removed.

Client compilation exposed a real Host import leak: collaboration DTO types imported runtime schemas and receipt projection/capability declarations, pulling Host root Context augmentation into browser `ctx.sessions`. Pure record and attributed-message schemas now own the DTO boundary, with SessionId imported from `/types` and explicit branded source schema annotations keeping generated declarations pure. Host domain/projection/runtime capability ownership remains unchanged. Admission mint/check still uses its private WeakSet, and authoritative record validation still checks complete journal replay consistency.

## TDD evidence

### Durable attribution RED

Command: `rtk pnpm.cmd exec vitest run packages/host/collaboration/tests/mailbox.host.spec.ts -t 'preserves original required-policy attribution'`.

Result: exit 1, two failing tests and 25 skipped tests. Production pre-step listeners rewrote source to `user`, or supplied a later required-policy source for the same identity. Durable `user/message` incorrectly retained the rewritten source instead of the exact original Peer source. This established the persistence defect before the correction.

### Durable attribution GREEN

Command: `rtk pnpm.cmd exec vitest run packages/host/collaboration/tests/mailbox.host.spec.ts -t 'preserves original required-policy attribution|valid-policy peer authority'`.

Result: three passed, 24 skipped, duration 7.13 seconds. The production Agent loop persists exact original attribution with transformed content, binds the actual model request and preserves the existing required-policy authority restriction.

### Data lifecycle RED and GREEN

Focused lifecycle cases initially produced two failures and two passes: refreshing a terminal stream did not create a new consumer, and a delayed older snapshot could overwrite a newer complete streamed view. The data owner now replaces terminal streams and rejects lower revisions. The focused data cases pass all four assertions.

### Production composition RED and GREEN

The real Loader/renderer test first exposed the two slot scope mismatch and then the synchronous roster rebuild `INACTIVE_EFFECT` during disposal. Separate reversible slot handles and the queued owner callback fixed those production lifetime defects. The final composed test loads the real browser feature through Loader, binds a truncated history window containing only ordinary human and durably attributed Peer append events, and renders the actual keyed Peer component. It asserts exactly one Peer and one ordinary user, no duplicate generic context, inert hostile text, actual identifiers, shared Portal/Board state, dialog cancellation and focus restoration. Actual plugin disposal closes the Remote consumer, removes registrations and restores a truthful generic Peer context. Loader remount reinstalls one Peer without duplicate rows.

Exact production composition command: `rtk pnpm.cmd exec vitest run packages/client/ui-collaboration/tests/apply.client.spec.ts`. Result: one passed, duration 14.44 seconds. The final package run below includes that case with the additional focus/cancellation assertions. The truncated-window fixture exercises the production conversation composition; it does not claim a separate production history pagination invocation. The production durable append evidence establishes why its source remains present in that window.

## Final focused verification

| Command | Result |
| --- | --- |
| `rtk pnpm.cmd exec vitest run packages/client/ui-collaboration/tests` | 12/12 tests across five files passed, duration 13.99 seconds. |
| `rtk pnpm.cmd exec vitest run packages/host/collaboration/tests/remote.host.spec.ts packages/host/collaboration/tests/observations.host.spec.ts packages/client/ui-collaboration/tests/data.client.spec.ts` | 31/31 tests across three files passed, duration 16.73 seconds. |
| `rtk proxy node node_modules/vitest/vitest.mjs run packages/host/collaboration/tests/state.host.spec.ts` | 14/14 tests passed, including authoritative journal/schema consistency, duration 3.12 seconds. |
| `rtk proxy node node_modules/typescript/bin/tsc -b packages/client/ui-collaboration/tsconfig.json packages/host/collaboration/tsconfig.json packages/core/agent-loop/tsconfig.json --pretty false` | Exit 0 after the pure DTO boundary and explicit callback cwd guard. |
| `rtk proxy node --import tsx scripts/run-oxlint.ts packages/client/ui-collaboration/src packages/client/ui-collaboration/tests packages/client/ui-chat/src/client/input-contributions.ts packages/client/ui-chat/src/client/conversation-nodes/message.ts packages/core/agent-loop/src/agent.ts packages/host/collaboration/src packages/host/collaboration/tests/observations.host.spec.ts packages/host/collaboration/tests/remote.host.spec.ts packages/host/collaboration/tests/mailbox.host.spec.ts` | Exit 0. Final Board-only lint after explicit cwd guard also exits 0. |
| `rtk proxy node --import tsx scripts/verify-translation-pairing.ts docs/architecture.md packages/client/ui-collaboration/README.md packages/client/ui-chat/README.md packages/host/collaboration/README.md packages/core/agent-loop/README.md .agents/notes/implemented/feature/2026-10-03-session-discussion-ui.md` | Six named pairs consistent. |
| `rtk proxy node --import tsx scripts/verify-doc-refs.ts` | 3199 source files checked; all documentation references resolve. |
| `rtk git diff --check` | Exit 0. |
| `rtk pnpm.cmd install --lockfile-only --offline --ignore-scripts` | Exit 0, no packages downloaded; lock diff contains only the optional new package importer. |

The management matrix covers snapshot-only, follow-only and both-false grants; both human channels consistently show the pair and explicitly shared records. Existing peer channels retain their respective filters. Unrelated viewers, forged projection selectors and unauthenticated access are rejected or filtered. Disconnection removes the pair in the next complete management generation. Native metadata tests cover normal checkout, linked worktree, detached HEAD, missing or malformed metadata and refusal to borrow a parent checkout when the nearest Git HEAD is unavailable. No Agent is awakened by observation.

Existing platform, workspace cycle, CLI binary and Vite tsconfig-plugin warnings appear in the package manager/test environment; tests have no assertion failures. The earlier generic Chat regression checkpoint passed 68/68 tests; it was not repeatedly run after the final scoped checks. The combined `test:gui` command was deliberately not run here under the recorded Task 10 combined-once ruling.

## Inherited failures preserved for assembly

`rtk proxy node --import tsx scripts/verify-agent-note-format.ts` exits 1 for prior notes only: `implemented/2026-09-09-skills-panel.md` and `implemented/2026-09-15-live-signal-distillation.md` have depth-two paths; `implemented/architecture/2026-09-04-news-page-host-client-boundary.md` and `implemented/feature/2026-09-07-news-vault-archive.md` have invalid/duplicate status lines; `implemented/feature/2026-09-20-vault-memory-view.md` lacks Problem, Consequences and Alternatives headings. The new note has no reported violation. No unrelated note cleanup was performed.

Required `rtk pnpm.cmd audit --prod` exits 1 with 63 vulnerabilities in the existing dependency graph: 7 low, 35 moderate and 21 high. Examples include existing `js-yaml` and `undici` paths. This feature introduces no external dependency or resolution change. The audit result is recorded without dependency upgrade expansion.

An earlier alias freshness check also reported existing missing ui-personal aliases. Only the feature's two required aliases were added; Task 10 owns the assembled freshness result.

## Changed files and self-review

Created the optional `packages/client/ui-collaboration` package manifests/compiler configuration, Host entry, browser composition, pure view types, local store bridges, Remote data owner, typed locales, native Portal/Board, Peer Definition/renderer, semantic CSS, focused tests and paired README. Modified the owning generic Chat input Definition and added its reversible contribution service. Modified the AgentLoop append boundary and its paired README. Added Host pure schemas and metadata observation helper; modified collaboration Remote/types/runtime imports and focused tests. Updated the Remote client type exports, client compiler reference/aliases and lock importer. Added the paired Agent Note and the required minimal paired architecture statement, with pairing records.

Self-review checked authoritative state ownership, grant-channel distinction, explicit budget/disclosure, source-kind exclusion cleanup, earliest original identity retention, unknown metadata, safe text, focus restoration and actual Loader disposal/remount. No shell core, central Session dispatcher, default bundle row, plan/task control or broad dependency change remains. The source schema extraction preserves the validation implementation rather than copying payload signatures. Final scoped lint, compiler and whitespace checks are green.

## Exact Task 10 assembly obligations and limitations

Task 10 owns the opt-in collaboration Host/browser bundle and recorded manifest. Default `base` and `web-app` must retain no collaboration rows, even disabled rows. Task 10 must run the one combined `test:gui` gate, assembled replay/production rendering checks, final V4 corpus and SDK expected outputs, generated catalog/export/config closure, supported build closure, plain Node exported-entry smoke and the concrete migration README Model Experience gate. Resolve or explicitly record inherited global note-format, alias freshness and dependency audit failures under that task's scope.

The same-user Host/Gateway limitation remains Prerequisite P: shared OS credentials do not establish action-authority isolation or an unforgeable human channel. Historical logs already persisted with rewritten `source=user` cannot recover missing Peer identity from an absent Inbox event; this change makes future required-policy appends truthful without fabricating historical identity or migrating unrelated humans. Observational metadata can remain unavailable and streams update on committed collaboration changes; no synthetic availability or branch facts are produced. No live runtime inspection/activation, real enrollment, remote Agent dispatch or external publication occurred.
