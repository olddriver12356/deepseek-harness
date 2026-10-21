---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-10-integrated-session-v5

## Summary

Acknowledges the integrated V5 writer, retained local admission attribution, Experts delegation and Personal observer records alongside native upstream V4 functionality.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-10-integrated-session-v5
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-16-session-format-v4"
    after: "22c6899a78214dd841c266348ae997027ef391174ddb21127f1b71dc1b362824"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-05-working-directory-attribution"
    after: "06d1d32a7f484663cc8261dad7da629c36ecaede0369aae9aeffac429776837e"
    decision: version-bump
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "32614cedcdb1e3b71994ac3badfc37ec8066be9db1855af0dd5dd0580940233a"
    decision: version-bump
  - root: "event:experts/delegation"
    previous: null
    after: "bdb00161ec9e2dd9a47ad4fa1bfe847dbc6519dc9a12fd262b7a0d7015880706"
    decision: version-bump
  - root: "event:personal/observation-request"
    previous: null
    after: "ac9368a3a99cbfec05c91bc66a16ffd47277ce21063cf9ca282440120bd6a224"
    decision: version-bump
  - root: "event:personal/observation-result"
    previous: null
    after: "cb93fd3e186e31aebe7cdc6133da735b61ec1164239abe1e19cc48f3be22adea"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "2cecb67d7acde1ec8efb361e2bb51b429130117eede64e1a1ed20a9768b1a29a"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "983de0188613eb0ac7e45bd2895fe494bb03aac7fd0fd23103972765ec5e740f"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

Native upstream V4 uses the ordinary adjacent migration to V5. Exact localV4SessionIds select the incompatible historical local V4 codec and reuse the upstream V3 transformation before V5 admission validation. Every source generation remains unchanged. Archived local-branch acknowledgements retain their original records and snapshots under local-history; they are historical evidence, not a second active successor chain. Unknown required events and malformed or missing admission policies remain refused.

<a id="verification"></a>
## Verification

Host and Desktop builds and Client typechecking passed. V4-to-V5 migration, historical restoration and the expanded replay corpus passed focused checks. The byte audit verified all 577 original Session JSONL paths against the protected pre-integration branch with zero changed or missing paths. Local inbox authority, Peer Inbox recovery and Experts dispatch passed 106 checks. No production Session data was migrated.

<a id="dev-note"></a>
## Dev Note

None.
