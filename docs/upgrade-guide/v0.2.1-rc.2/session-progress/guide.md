---
kind: upgrade-guide
description: "Sessions using long-term progress or guarded Goal continuation require a reader that understands their required records."
---

# Open Sessions with long-term progress safely

English | [中文](guide.zh.md)

## Change

Sessions may contain required `progress/change` records and logged `long-term-progress` reminder messages. Goal continuation messages name the `goal-round` admission policy. An older reader without the new required event refuses the Session rather than silently discarding milestone authority or treating the record as corruption. Existing Sessions without these records retain their meaning; the checkout writer version does not change for this addition.

Once a Session has a nonempty milestone list, ordinary Goal creation or editing cannot select unrelated work. Execution must bind a consecutive unfinished checkpoint group within the explicitly released current milestone. Approval, release and acceptance are distinct, and reopening or forking never arms execution. Custom consumers of the Goal service must handle a refused scope operation instead of bypassing it.

## Migration

1. Upgrade every Host or SDK runtime that opens a progress-bearing Session together. Keep an untouched backup of its Session artifact; do not remove `progress/change` records or mark them ignorable to make an old reader accept it.
2. Custom compositions mount `@deepseek-ai/dsh-long-term-progress` alongside the existing Goal service and driver. The base profile includes it; this does not authorize a running deployment to restart automatically.
3. Review the restored list with `/long-goal status`. Explicitly start the approved milestone, or resume its bound execution Goal after checking the intended scope. Reconfirm a fork's existing checklist association before enabling writeback.
4. Confirm that compact progress is visible, saving a draft starts no turn, and a milestone boundary stops for human verification. The package [contract](../../../../packages/goal/long-term-progress/README.md) documents the command grammar, tools, limits and filesystem conflict handling.
