# Agent Note: Required input admission and durable peer recovery

Status: implemented

## Problem

Persisted peer inbox work can outlive its optional collaboration plugin. Source declarations validate data but do not require a runtime authority owner. A resumed agent with no collaboration listener otherwise sends that work to the model when the next human prompt wakes it. Ordinary waterfall rejection also stops the driver with the later human prompt still queued. Delivery recovery needs to wake an existing durable message, and human input can arrive during the final recipient flush or acknowledgement await.

## Decision

Message source metadata can require a named admission policy. AgentRegistry owns reversible policy registration; agent-loop checks both originally claimed and downstream admitted messages after pre-step and again after asynchronous request preparation. Requirements retained for the active turn cannot be removed by rewriting a source or replacing the visible history. Missing or disposed policy prevents a model request. A policy denial records one blocked turn and reaches the existing pending-input drain, so a queued human prompt runs without another wake. Ordinary listener rejection retains its existing semantics.

`Agent.wake()` schedules existing pending input, holds behind maintenance, and does nothing after disposed cancellation or with no input. `Inbox.move()` records one reorder splice for an existing identity without publishing insertion or discard notifications. Collaboration uses these owner methods under maintenance to keep human FIFO before peer FIFO while preserving neutral context positions. The final ordering and wake are synchronous. Original inbox receipt projection de-duplicates reorder rows by peer message identity.

Collaboration first commits its outbox and activation reservation, appends attributed recipient input, flushes recipient persistence, acknowledges admission, and wakes pending work. Recovery reconciles the recipient's own non-inherited receipt with its exact pending identity, including an admitted row whose wake was interrupted, and charges no second activation. The fixed policy checks exact source, content, recipient, committed admission and live pair authorization for new input. Existing Session events distinguish pending, claimed, started, consumed, refused and cancelled receipts. A started turn continues after pause or disconnect, while missing or disposed policy remains a refusal. Original authority classification is captured before a listener can mutate the claimed array. A durable acceptance receipt does not report assistant completion or human approval.

Policies may synchronously return `'defer'` before claim or during preparation before durable user admission. The internal inbox claim skips pending deferred identities; a later deferral restores an original claim's identity, content, list and position through existing durable splices without insertion or cancellation notifications. Human FIFO and peer FIFO survive, and the existing owner wake resumes the retained claim without another activation charge. The receipt fold restores `pending`; only proven terminal refused or cancelled input settles an admitted row to failed. Actual request checks still require `true`. These internal changes are necessary because pre-step and request preparation await after durable claim. They add no public Inbox member or Session event; the rebuildable receipt cache advances its version.

The loop registers an Agent-scoped executor guard over the active turn's retained required inputs. Collaboration unload can remove its own guard while a response is pending, so pre-request checks and plugin disposal alone cannot enforce that response's tools. The retained check denies native and alternate dispatch when a required policy is unavailable. Turn completion releases the inputs, and Agent scope disposal releases the guard; later human turns and remount do not inherit an orphaned refusal.

Collaboration commits bounded diagnostic enums through the existing aggregate and a system-owned `delivery-status` operation, including explicit clearing after successful resolution. Ordinary resolver `session/not-found` and its subagent-ownership `session/agent-busy` result fail queued delivery; unavailable resolver, internal failures and unknown exceptions remain retryable. Admitted history and charges survive resolution failure because it supplies no evidence of terminal input refusal. Human views and model status read the same committed reason. Identical retry preserves acceptance identity and budget, and unchanged failures do not append another journal entry. Raw exception text stays outside shared records. Optional reason fields preserve old aggregate rows and replay; older readers reject the new operation. The Session persistence inventory is unchanged by these diagnostic additions.

The declared source union affects four persisted message roots. The adjacent V3-to-V4 package adds strict policy validation while preserving event payloads, identities, coordinates and inherited cuts. JSONL publishes a version-named successor without modifying predecessors. The latest released-format record stays V3 until a release occurs.

## Alternatives considered

**Plugin-only pre-step listener.** An absent plugin has no listener, so it cannot refuse restored peer input. Prompt text also cannot enforce admission.

**General unknown-source refusal.** That changes unrelated source extensibility and ordinary restoration. Explicit required policy metadata limits refusal to its declaring input owner.

**Cancel and reinsert the pending peer.** Standard splice removal publishes cancellation and new insertion notifications. Internal restore and reorder retain the same input and its truthful lifecycle.

**Another scheduler or database.** Existing driver wake, idle maintenance, inbox projection and storage-domain transactions already own those responsibilities. The additions expose only the operations missing from those owners.

## Consequences

The feature adds shared-runtime API and an adjacent format dependency, increasing upstream integration work. Upgrade checks also retain the internal restoration and Agent-scoped executor check. Verification covers absent/disposed policy, unload with a pending native or alternate call, remount and later human work, source rewriting, pause during pre-step/request/prepareCall, durable reconstruction, truthful terminal settlement, human and peer FIFO, stable retry diagnostics, held wake, own versus inherited receipts and unchanged predecessor files. An upstream equivalent can replace these additions only after those behaviors remain verified.

This mechanism does not isolate arbitrary Host code or authenticate a same-user process as human. Collaboration remains discussion-only. Version-named recorded-session successors and both SDK expectations must be maintained with the current writer; retaining old generations does not provide downgrade support.
