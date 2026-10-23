---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-23-session-progress

English | [中文](2026-10-23-session-progress.zh.md)

## Summary

Adds required progress/change records for revision-bound Session milestones, checkpoints, evidence, authorizations and checklist settlements, and a long-term-progress message source for admitted-turn context.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-23-session-progress
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "f5d99f25657e072b598781f7283d3bb6511f93024b3853329028964bead0d10c"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "cc56b1830e67bb45ce42640d75917653fa2101dc69bc700fbfbb2ba45f17b9c3"
    decision: same-version
  - root: "event:personal/observation-request"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "8b079827121a1e9e514bd3ae0a003c80365a9c985cecabfc6aa74ffec5f1a651"
    decision: same-version
  - root: "event:progress/change"
    previous: null
    after: "a844470015072a2558d778fdee310fb96e6965715dcedd6c530467ffa21e90e0"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "66da165f7246803812f97b1dbff58abbf86054c2497bd56a2847a232e26f485f"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-20-integrated-rc2-session-v5"
    after: "d0fa81cc847e60e9e9b09f83ce4267fedbee426f5331398c3a0028d047c8ed75"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

New readers accept existing logs without progress records and initialize an empty projection; new required records are replayed through strict transition validation. Older readers lack the progress/change discriminator and refuse such Sessions before adopting or freezing their events, rather than skipping authority or truncating a tail. The message source union is additive: readers retain ordinary message content and treat the source as metadata; it grants no execution permission. Progress-bearing Sessions also contain the required discriminator, so older readers cannot silently reconstruct milestone authority. Existing event representations and the Session header remain unchanged; no downgrade path is introduced.

<a id="verification"></a>
## Verification

Executed node node_modules/vitest/vitest.mjs run packages/session/session-persistence/tests/storage-contract.spec.ts packages/goal/long-term-progress/tests: 92 tests passed, including the older-reader discriminator refusal and strict progress replay. Executed the authored TypeScript SDK long-term-progress refresh through dsh --profile sdk: 1 selected scenario passed. Executed uv run --project python/sdk python scripts/smoke-python-runtime.py --scenario sdk-progress --exe apps/cli/lib/bin.js --update-snapshots: passed, checking persisted records, subscription events and the admitted reminder.

<a id="dev-note"></a>
## Dev Note

None.
