# Handoff: OpenSpeedy adoption and native DSH Apps — paused by owner

## Next action

Wait for the owner to resume. Then inspect current Apps files and dirty Git state, install/verify the official signed OpenSpeedy portable in a separate runtime directory, and implement the approved native registration/start flow using test-first changes. Coordinate any 3910 restart separately after tests/build. Do not automatically resume background work while the owner is away.

## User intent / approval

> can you clone a local repo into OS-Project, and then registered the correct entry in DSH's app page with correct boost command

The owner selected official desktop portable plus an extension of DSH Apps for native executables. Approved design: native executable + working directory + argv, no fabricated HTTP health URL, process-based running state, existing Web Apps remain compatible. No game selection/injection during verification.

> sounds good let's do this

Latest instruction:
> gonna hit the hay, record this and we come back later

## Verified current checkpoint

- Source clone: `C:\OS-projects\openspeedy`, clean at `ac60a92ab8e23b9e0dad826b678d66e5259e5e38` (3.3.13), correct GitHub origin. No npm install/build was run for OpenSpeedy.
- Build tools inspected: Node26.7.0, cargo1.96.0, Rust x86_64 Windows target, VS2022 C++ BuildTools. CMake not on PATH and no i686 target. These are source-build gaps, not blockers for official portable adoption.
- No portable downloaded/installed, no native process launched, no Apps entry saved, no game touched, no3910 restart.
- Existing Apps only accepts npm/pnpm/yarn/bun scripts + HTTP URL/port and checks fetch readiness. `npm run dev` would be frontend only; registering that as the working desktop utility is wrong.
- Implementation delegation was interrupted at owner's pause. Scoped `git status --short -- packages/host/apps packages/client/ui-apps` returned no changes. The child subsequently confirmed: zero file edits, tests, typechecks or builds, no settings/worktree access, and is now idle. Recheck all actual client Apps paths before resuming.
- Child id `5bd9d144-dc17-494b-8a45-685098b67b7d` was told to remain idle and report only current checkpoint, not continue edits/builds.
- Goal `goal-98f82425-f822-4d96-88c6-b457d9661729` was paused before this approval. Tool refused model resume with `the model cannot resume a paused goal; the user must resume it`. Do not create another automatic loop while user sleeps.

## Read instead of duplicating

- Repo `AGENTS.md` and `context/handoff/2026-10-01-dsh-cleanup-handoff.md`: dirty-main preservation and concurrent Collaboration boundaries.
- Vault `Resources/Open Source Projects/OpenSpeedy.md`: pinned architecture/risk/setup analysis.
- Vault `Workspace/Projects/DeepSeek Harness/Log/2026-10-02-deepseek-harness-log.md`: project progress and other unactivated Skills UI work.
- Host implementation `packages/host/apps/src/{index,types,runtime,manifest}.ts`, host tests and actual corresponding client package: identify all consumers before schema change. Preserve legacy persisted records.

## Approved constraints

Use official release hash metadata and Authenticode verification before execution. Keep source clone separate from portable runtime. Absolute executable and argv, not arbitrary shell strings. Native status uses process lifecycle, no HTTP polling. Test failure/start/exit and Web App compatibility. Native start only opens OpenSpeedy; never drives injection or bypasses security/anti-cheat. Avoid broad dirty-checkout build/stage/commit and all Collaboration worktrees. Build narrowly then verify existing3910 URL after approved refresh/restart; launching another server does not update it.

## Plugin sweep finding

`dsh-desktop-launcher` was inspected via npm metadata: it creates macOS/Linux launch shortcuts for DSH itself, not Windows desktop entries inside Apps. It cannot satisfy this scenario. No plugin installed. Further marketplace checks may be needed if choosing a different off-the-shelf alternative.

## Suggested skills

- `oss-adopt` for installation/tracking; `test-driven-development` for the approved bounded Apps extension.
- `verification-before-completion` for tests, signature and exact GUI evidence.
- `security-review` for executable/argv validation and persisted launch authority.
- `react` if modifying client TSX; `orca-cli` / `cowork-send` only if live-peer coordination is actually needed.

## Still owed

Portable install/signature/hash verification; RED/GREEN Apps extension and UI; supported package build; registration via actual settings/API; visible native-window launch and lifecycle verification; owner-coordinated runtime activation; promote the flat OpenSpeedy resource profile to a maintained folder with honest Local Setup/update record only after there is verified runtime content.
