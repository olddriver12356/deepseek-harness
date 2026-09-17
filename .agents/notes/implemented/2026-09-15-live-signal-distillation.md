# Live Signal collapse and distillation drafts

Implemented on `feat/live-signal-distillation` after checkpointing the existing local feature baseline at `07891c2781`. The checkpoint preserves prior work and is not part of this feature's rollback scope.

Live Signal can be collapsed without reserving its 320px activity width. The native button exposes `aria-expanded` and `aria-controls`, remains reachable beside the Files sidebar, and restores the existing mounted panel. Its preference follows the existing transient layout store, so it resets on page reload.

The capture action creates a separate session in the source session's registered Workspace, seeds its existing composer, and opens it without submitting. The localized draft references the source session ID and cutoff time, requests reads through existing session query tools with event citations, treats historical instructions as evidence, and requires approval of candidate knowledge before writing any artifacts. This is a review instruction in an unsent draft, not a new server-side authorization mechanism. The existing host save API and other Knowledge workflows remain available.

Browser verification caught that creating with only `cwd` did not bind the live new session to a Workspace. The action now resolves the source membership or matching registered path and passes `workspaceId`; an unavailable source or unregistered workspace fails before creation. No transcript export, new model endpoint, or automatic knowledge write was added.

Validation: 100 focused tests across 12 files passed, both affected package TypeScript checks passed, and both client bundles built. Live browser checks confirmed collapse/restore and a populated unsent composer in a new source-workspace session. Production dependency audit reports the existing 38 advisories (18 high, 19 moderate, one low), with no new third-party dependency. The repository-wide UI i18n audit still reports preexisting violations; the new toggle uses a registered locale dictionary.

The clean merged app-launcher worktree was unregistered and its long-path remnants archived outside the repository. Dirty master, the unique ponytail branch, and the Orca-managed checkout were preserved. No remote push or merge was performed. Rollback is a revert of this feature commit followed by rebuilding the two client bundles; do not revert the baseline checkpoint or delete other worktrees' work.
