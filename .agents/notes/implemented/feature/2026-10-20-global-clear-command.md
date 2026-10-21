# Agent Note: Global conversation clear command

Status: implemented; UI extension live-verified, complete regression pending at owner-requested pause.

## Upstream rc.2 compatibility

The rc.2 merge retains the empty system surface replacement and command-correlated clear projection. The system-message constructor now accepts only its text. The token-meter projection accepts an empty replacement after its adjacent shadow-price event because that node contributes no system prompt whose ordering needs reconstruction; nonempty system replacements remain rejected. This narrow shared-projection change also covers replay of prior clear events. Switching the reset to a nonempty user message would leak synthetic text into the next request, and removing its meter would misstate context pressure. The command replay test and context-breakdown regression cover the exception and the existing nonempty refusal.

## UI clear extension checkpoint

The owner approved keeping one append-only Session history while hiding pre-clear UI material and returning to the same Session's blank hero. The command now registers a whole-log `conversationClear` projection correlated from command/run to successful command/done. It carries the latest throughSeq and post-clear activity so cold/paginated opens do not rely on loading the command row. Failed commands do not advance the boundary. Conversation assembly filters all view targets at that boundary; audit visibility is an explicit read-only toggle that never restores model context. The Chat rail suppresses pre-clear whole-log outline entries unless audit mode is open.

Local Web registration now points to `lib/clear-ui-v3.js`. Actual browser bundles require package-local tsdown or a correctly selected client build, not a host-only filtered build. The existing Host clientModules.rebuilt seam was used to publish rebuilt plugin bytes; the Host was not restarted. On http://127.0.0.1:43910 an isolated Session with OLD_CLEAR_UI_SENTINEL showed a blank hero after refresh, revealed the sentinel through the earlier-history button, and hid it again. No user conversation was cleared as a test. Temporary verification plugins were removed from the profile and moved to the OS temporary directory. Evidence: OS temp dsh-clear-ui-check.json (contains authenticated launch URL; do not publish).

Nineteen focused tests passed. A full test:web attempt failed host compilation because an existing test used import.meta.glob with an unsupported eager overload; replaced it with a static implementation import. A follow-up host compile and test:web:built job was stopped at the owner's request to wrap up. Complete regression, phase/stream/pagination edge checks, UI polish, README/build.ps1 deployment filename update and any final review remain for the next session. No commit or push. The current browser test Session has no registered workspace, so its hero shows Choose workspace; real workspace-bound Sessions should retain their existing workspace. Verify continuation explicitly next time.

## Context

The owner requested a real `/clear` command available across Web workspaces, reusing the current Session with no prior conversation context. A workspace skill alias cannot perform the direct human-command operation. The existing Session surface replacement and Agent maintenance APIs already provide the required mechanisms.

## Decision

Keep the feature in the optional `packages/session/command-clear` plugin and load its built file URL from the local Web profile patch. Do not add it to the shipped base bundle or modify the agent loop. Clear the receiving Agent's pending inbox and current goal, preserve the protected system head, and replace all other current surface nodes with an empty system node. Price the replacement through the existing adjacent `compaction/prune` protocol. Flush before success and reject busy Agents.

The old human transcript, Session identity, model, permissions and tools remain. This is not secure erasure or a complete reset of every plugin's domain state; background jobs and external memory are outside scope. Workspace instruction and skill catalog owners reconcile against the remaining surface on the next turn.

## Alternatives

Deleting or truncating the log would lose audit history and violate released persistence guarantees. Creating a new Session would not reuse the requested identity. Summarization would preserve unwanted conversational context and incur a model call. A new core reset API or event is unnecessary while the existing surface operation suffices.

## Verification

The focused Loader/AgentLoop suite passes four tests, including actual JSONL persistence, replay, same-Session next-request isolation, global discovery, disposal and busy/argument rejection. Initial runtime verification exposed zero-valued turn metadata that detached replay did not reject; the implementation uses positive metadata and the suite now mounts JSONL persistence. An isolated Session in the existing port-43910 Host discovered and executed `/clear`, removed its sentinel from the model surface, flushed successfully, and retained the original audit entry. Its report is `%TEMP%/dsh-command-clear-live-verification.json`. Temporary verification plugin rows were removed after the successful check.

## Consequences

The deployment references `lib/clear-v2.js` because replacing a Loader row's module name while retaining its identity did not replace the previously loaded implementation during the first live update. The corrected row uses a new entry identity. `packages/session/command-clear/build.ps1` runs typecheck, tests, focused bundling and an import smoke check, and refreshes this activation artifact. A future code update still requires a deliberate module reload or Host restart; rebuilding alone is not runtime activation. Remove the `command-clear-v2` insert row to disable the feature. No existing user Session was cleared during verification.
