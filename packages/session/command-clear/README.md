---
description: "Optional human slash command for resetting one Session's model-visible conversation while retaining its identity and audit history."
kind: "package-reference"
---

# @deepseek-ai/dsh-command-clear

Registers `/clear` on the human-command registry. Mount the plugin at the Web profile root to make it available across workspaces; each invocation affects only its receiving Agent.

## Behavior

The command requires an idle Agent, takes the existing maintenance reservation, clears pending input and the current goal when that service is present, and replaces the conversation surface with an empty system-message node. The protected leading system prompt remains; workspace instructions, skill catalogs and runtime context are reassembled on subsequent turns by their owning plugins. Session identity, working directory, model, permission settings and the append-only audit log remain unchanged. No summarization model call is made.

The registration supplies a lazy EN/ZH human-only usage guide through the command registry; reading it neither resets context nor calls a model. The command flushes the Session before reporting success. A persistence failure reports that the in-memory reset may not survive restart. Running or maintenance-busy Agents reject the command rather than cancelling work implicitly. Arguments and attachments are not accepted.

## Installation

Run `pwsh -NoProfile -File packages/session/command-clear/build.ps1` from the repository to typecheck, test, bundle and smoke-import the plugin. The local Web deployment points at `lib/clear-ui-v3.js`; the pipeline refreshes it and the older `lib/clear-v2.js` identity. Changing built code does not itself guarantee a live module reload. Add an `insert` row to `$DSH_HOME/profiles/web/cordis.patch.yml` naming the built module by its absolute file URL, or install the package into that profile and use its package name. This is a root plugin registration, not a skill file or a workspace-scanned command directory. Remove the row to unregister it.

## Verification

`node node_modules/vitest/vitest.mjs run packages/session/command-clear/tests/clear.spec.ts` exercises Loader registration, disposal, same-Session continuation with an actual AgentLoop and scripted model, replay, pending input, repeated resets and busy/argument rejection. `node node_modules/typescript/bin/tsc -b packages/session/command-clear/tsconfig.json` checks the package types.

## Model Experience

### What the model sees

The next request contains the current system instructions and newly assembled operating context, followed by new input. Old conversation messages and compacted summaries are not retained on the model-visible surface. The command and its direct success text are not model messages.

### Token effect

Removes retained conversation tokens, with an adjacent `compaction/prune` price for the existing context-meter projection. Historical usage totals remain audit totals.

### KV Cache effect

The changed surface starts a new request series. Previous conversation-prefix reuse is not preserved.

## Known Limitations and Deferred Work

This is a conversation-context reset, not a new Session object or a secure erase. It does not stop external jobs or child agents, delete files, erase cross-session memory, reset all plugin-owned domain state, or erase the previous human transcript. Background producers may deliver new input later. Settings and tool definitions remain active. An independently installed plugin that reconstructs context from the whole audit log may reintroduce historical material; such plugins require their own reset support.

## Runtime invariant

No companion is published: command registration and disposal belong to the command registry; Session validates surface replacements and replay; the token-meter consumes the existing adjacent shadow-price protocol. No independent mutable service is introduced.
