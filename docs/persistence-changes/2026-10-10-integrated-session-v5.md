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
    previous: "2026-09-21-user-question-reply"
    after: "1b7f4834baa766e4be4e6b181c66ccb95d7821c76e904c199e7d5b65ff79ce1c"
    decision: version-bump
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "fe550a604facb21452404d7f759a059e6ac38fa4ec5b35f08184f131a3d67de6"
    decision: version-bump
  - root: "event:experts/delegation"
    previous: null
    after: "bdb00161ec9e2dd9a47ad4fa1bfe847dbc6519dc9a12fd262b7a0d7015880706"
    decision: version-bump
  - root: "event:personal/observation-request"
    previous: null
    after: "e7ead6cce73e69de2696759908d22b09da367bad777e1612126a9003578bee8d"
    decision: version-bump
  - root: "event:personal/observation-result"
    previous: null
    after: "cb93fd3e186e31aebe7cdc6133da735b61ec1164239abe1e19cc48f3be22adea"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "26c266fcae3bf58ae54d1588ee771255de94a68274ca0c730b2e6015c430c9d1"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "d8190f20cdf7e12266548c228c7c63ee16bc00a23ea0f2e1cb53575547655045"
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
