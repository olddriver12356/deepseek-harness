---
kind: upgrade-guide
description: "The integrated local build writes Session V5 and requires explicit identities to read the incompatible pre-integration local V4 format."
---

# Preserve local V4 Sessions when adopting the integrated build

## Change

The integrated local build writes Session V5. Native upstream V4 remains readable through the upstream codec. The earlier local build also used version 4 for a different representation; only exact Session identities listed in `session-persistence-jsonl.localV4SessionIds` select that historical local codec. The reader never guesses which V4 representation a Session uses. An older writer cannot safely resume a V5 generation.

The [format decision](../../../../.agents/notes/implemented/architecture/2026-10-09-preserve-local-and-upstream-session-formats.md) records the compatibility boundary and retained local event attribution.

## Migration

1. Before an approved rollout, stop writers and back up the complete Session directory, configuration and current runtime. Inventory the exact IDs written by the earlier local V4 writer. Keep native upstream V4 IDs out of this inventory; the version number alone does not identify the local representation.
2. Add that exact string array to the JSONL persistence plugin's `localV4SessionIds` configuration. Keep the same array in a private JSON file for the migration command.
3. First copy the Session directory to an isolated test location. Run `pnpm run migrate:sessions-to-current -- --sessions-dir <copy> --local-v4-ids <identities.json>`. The command publishes V5 successors beside unchanged historical generations and prints the private report location. Resolve every reported failure before considering a production run. The legacy `migrate:sessions-to-v4` command is an alias and also targets V5 in this build.
4. Confirm that the report has no failed Sessions, original generation bytes remain unchanged, and the integrated build reopens the copied Sessions with their messages, tool results and local attribution intact. Confirm native upstream V4 Sessions also reopen without appearing in the local identity inventory.
5. Run against production only after separate rollout approval and a reviewed rollback plan. Rollback restores the backed-up runtime, configuration and Session directory together; do not point the old writer at generations created by the new build.
