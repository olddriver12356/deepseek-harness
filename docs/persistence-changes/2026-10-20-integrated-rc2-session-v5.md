---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-20-integrated-rc2-session-v5

## Summary

Integrates upstream rc.2 persistence types with the local V5 admission policy, Experts delegation and Personal observer records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-20-integrated-rc2-session-v5
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-16-session-format-v4"
    after: "22c6899a78214dd841c266348ae997027ef391174ddb21127f1b71dc1b362824"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "275ff415afa4cbe4bd8d31a66e3ec3bfed96439fd07a2d8dc67d101bc16aea57"
    decision: version-bump
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "84320ad91716eace07152707934ac1a32e8c96eebccbf3bd7c7664e7f1ced590"
    decision: version-bump
  - root: "event:experts/delegation"
    previous: null
    after: "bdb00161ec9e2dd9a47ad4fa1bfe847dbc6519dc9a12fd262b7a0d7015880706"
    decision: version-bump
  - root: "event:personal/observation-request"
    previous: null
    after: "5265aaf6c32989dbf0c9bb2fb19ff59b803e183c6503803428c93b98713635ff"
    decision: version-bump
  - root: "event:personal/observation-result"
    previous: null
    after: "cb93fd3e186e31aebe7cdc6133da735b61ec1164239abe1e19cc48f3be22adea"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "5bd3468c2e8ab2494e22774d8c10233cb0897616a9f18e2c0d54291ffcde12c9"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "9fa44fb21d1586262983f43cdfb69e78eefedccd913fe75665a789f2a41de07c"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

Upstream V4 uses the ordinary adjacent V5 migration. Only explicitly configured localV4SessionIds select the historical local V4 dialect. Both routes preserve predecessor files and validate required input admission; unsupported required events remain refused. Existing V5 records retain their required policy attribution. Upstream readers reject the newer V5 header, avoiding reinterpretation of local records. The earlier local V5 acknowledgement and after-schema are retained unchanged under local-history so upstream acknowledgements keep one active successor chain.

<a id="verification"></a>
## Verification

128 focused JSONL migration and collaboration tests passed with one skipped; the clear replay tests and context-breakdown tests passed. All 857 pre-existing historical Session generations remain byte-identical. Host, Client, Web builds, aggregate checks and isolated Web collaboration startup passed. No production Session data was migrated.

<a id="dev-note"></a>
## Dev Note

None.
