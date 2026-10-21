# Historical local persistence acknowledgements

These records and schema snapshots preserve the local branch's pre-integration persistence history. The local writer advanced from V3 to a local V4 representation independently of upstream's different V4 representation. The original records remain unchanged; combining their predecessor links with upstream's active acknowledgement chain would create a false fork for the same logical root.

The active history follows upstream's acknowledged lineage and then the [integrated V5 acknowledgement](../2026-10-20-integrated-rc2-session-v5.md). The [format decision](../../../.agents/notes/implemented/architecture/2026-10-09-preserve-local-and-upstream-session-formats.md) explains the explicit local identity boundary and the retained historical readers.

- [Experts delegation and Personal observer events](2026-09-20-expert-delegation-and-observer-events.md), with its [original schema snapshot](2026-09-20-expert-delegation-and-observer-events.schema.json).
- [Local V4 collaboration admission policy](2026-10-03-collaboration-input-policy.md), with its [original schema snapshot](2026-10-03-collaboration-input-policy.schema.json).

The original October 10 V5 acknowledgement and complete after-schema remain here unchanged. The October 20 integration acknowledgement follows the rc.2 upstream chain and carries the combined current schemas.
