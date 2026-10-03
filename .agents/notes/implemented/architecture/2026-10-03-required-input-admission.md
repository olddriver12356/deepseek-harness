# Agent Note: Required input admission and durable peer recovery

Status: implemented

English | [中文](2026-10-03-required-input-admission.zh.md)

## Problem

Persisted peer inbox work can outlive its optional collaboration plugin. Source declarations validate data but do not require a runtime authority owner. A resumed agent with no collaboration listener otherwise sends that work to the model when the next human prompt wakes it. Ordinary waterfall rejection also stops the driver with the later human prompt still queued. Delivery recovery needs to wake an existing durable message, and human input can arrive during the final recipient flush or acknowledgement await.

## Decision

Message source metadata can require a named admission policy. AgentRegistry owns reversible policy registration; agent-loop checks both originally claimed and downstream admitted messages after pre-step and again after asynchronous request preparation. Requirements retained for the active turn cannot be removed by rewriting a source or replacing the visible history. Missing or disposed policy prevents a model request. A policy denial records one blocked turn and reaches the existing pending-input drain, so a queued human prompt runs without another wake. Ordinary listener rejection retains its existing semantics.

`Agent.wake()` schedules existing pending input, holds behind maintenance, and does nothing after disposed cancellation or with no input. `Inbox.move()` records one reorder splice for an existing identity without publishing insertion or discard notifications. Collaboration uses these owner methods under maintenance to keep human FIFO before peer FIFO while preserving neutral context positions. The final ordering and wake are synchronous. Original inbox receipt projection de-duplicates reorder rows by peer message identity.

Collaboration first commits its outbox and activation reservation, appends attributed recipient input, flushes recipient persistence, acknowledges admission, and wakes pending work. Recovery reconciles the recipient's own non-inherited receipt with its exact pending identity, including an admitted row whose wake was interrupted, and charges no second activation. The fixed policy checks exact source, content, recipient, committed admission and live pair authorization for new input. Existing Session events distinguish pending, claimed, started, consumed, refused and cancelled receipts. A started turn continues after pause or disconnect, while missing or disposed policy remains a refusal. Original authority classification is captured before a listener can mutate the claimed array. A durable acceptance receipt does not report assistant completion or human approval.

Policies may synchronously return `'defer'` before claim. The internal inbox claim skips those identities without mutation or lifecycle notifications, allowing ready human input to retain FIFO order. With only deferred initiating input, the driver becomes idle without opening a context-only turn. Actual request checks still require `true`. This owner extension is necessary because pre-step listeners run after durable claim: rejection there consumes an unacknowledged peer. ACK recovery uses existing maintenance and wake; readiness and drain decisions contain no await, and the maintenance wake latch retains the wake through release. The receipt projection's private cache version changes; no new Session event or collaboration storage schema is introduced.

The declared source union affects four persisted message roots. The adjacent V3-to-V4 package adds strict policy validation while preserving event payloads, identities, coordinates and inherited cuts. JSONL publishes a version-named successor without modifying predecessors. The latest released-format record stays V3 until a release occurs.

## Alternatives considered

**Plugin-only pre-step listener.** An absent plugin has no listener, so it cannot refuse restored peer input. Prompt text also cannot enforce admission.

**General unknown-source refusal.** That changes unrelated source extensibility and ordinary restoration. Explicit required policy metadata limits refusal to its declaring input owner.

**Cancel and reinsert the pending peer.** Existing splice removal publishes cancellation and new insertion notifications. The reorder method retains the same input and its truthful lifecycle.

**Another scheduler or database.** Existing driver wake, idle maintenance, inbox projection and storage-domain transactions already own those responsibilities. The additions expose only the operations missing from those owners.

## Consequences

The feature adds shared-runtime API and an adjacent format dependency, increasing upstream integration work. Upgrade checks cover absent/disposed policy, original/downstream source rewriting, asynchronous revocation, normal human restoration, automatic human draining, held wake, truthful reorder notifications, final flush/ack human races, own versus inherited receipts and unchanged predecessor files. An upstream equivalent can replace these additions only after those behaviors remain verified.

This mechanism does not isolate arbitrary Host code or authenticate a same-user process as human. Collaboration remains discussion-only. Version-named recorded-session successors and both SDK expectations must be maintained with the current writer; retaining old generations does not provide downgrade support.
