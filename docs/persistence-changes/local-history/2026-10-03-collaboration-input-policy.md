---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-03-collaboration-input-policy

## Summary

Adds requiredAdmissionPolicy to message source metadata and the strictly attributed collaboration-peer source alternative. Advances the checkout Session writer from V3 to V4.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-03-collaboration-input-policy
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "1a3440e3577382704d42a6263aa463504eb74c566734a55e9503a63efcd02445"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-14-image-offload"
    after: "bea2b17ef9a661bb8df231dae81dfb06e1a79a729fce15e8688f2f4283858586"
    decision: version-bump
  - root: "event:personal/observation-request"
    previous: "2026-09-20-expert-delegation-and-observer-events"
    after: "674ebedef5e276d110225e53965f7a1b9b463d19e3c356b8ee34c603eeba17c6"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-09-14-image-offload"
    after: "502f04aa7b46cada5280ce8ad8e81986199418cfe1e37dc919fda3e51a4e7df6"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-09-14-image-offload"
    after: "cbcaf29b2fc01f442470184b9015839a593f690a5eb7cd83518d42cef9a48551"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

The adjacent V3-to-V4 migration preserves event data, message identities, sequence coordinates and inherited cuts. V3 input cannot retroactively acquire V4 admission metadata. V4 validates the collaboration source identities and fixed policy identifier before interrupted-tail recovery. The runtime refuses required input when its policy is absent or disposed. JSONL publication writes a version-named successor and retains the committed V3 generation unchanged. The latest released format remains V3.

<a id="verification"></a>
## Verification

Focused Vitest runs passed 29 catalog and V3-to-V4 migration tests, plus the actual JSONL V4 successor publication test preserving V3 bytes, inode, size and modification time. Collaboration recovery tests exercise missing policy, disposed registration, downstream source rewriting, and ordinary human-only restoration. Four affected message-source event roots are acknowledged with the SessionHeader version transition. Recorded-session corpus successors remain an explicit integration obligation.

<a id="dev-note"></a>
## Dev Note

None.
