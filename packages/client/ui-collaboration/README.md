---
description: "Optional human controls for independently owned Session discussion connections and attributed Peer messages."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-collaboration

English | [中文](README.zh.md)

## Summary

This optional browser plugin adds Peer connections to the existing Live Signal sidebar and opens a discussion details dialog through the existing shell overlay. It preserves the shell's background, layout and design tokens. The dialog controls human-owned connections, disclosure, separate pair record grants, pause, disconnect and an explicit activation budget. It adds a visibly attributed Peer chat node. This V1a surface has no plans, tasks, invitations, enrollment or execution controls.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Add this browser plugin only to an explicit opt-in assembly that enables the Host collaboration plugin with its explicit storage capacities, message bound and discussion tool allowlist. The default base and Web bundles contain no collaboration row. This package requires the generated `remote.collaboration` contribution, Session Controller, UI Conversation, Chat input contributions, Slots and Locale. Resolving the package does not activate collaboration or enroll Sessions.

Choose Add peer, select an ordinary Session, enter display labels, accept the discussion disclosure, choose both pair grant values and enter a nonnegative whole activation limit. Zero is supported; the fields have no numerical defaults. The Host validates actual stored workspaces before committing a pair. An inactive ordinary Session remains reachable. Unavailable metadata is labeled as not observed, and registration labels never stand in for current filesystem or Git facts.

Select a connection to see its endpoints, actual cwd, observed checkout and branch, charged activations, explicit pair grants and shared message states. Pause stops new admissions, disconnect removes the pair and cancels queued work, and Open session uses Session Controller. Changing a limit cannot refund charges or reduce it below the charged count. These controls grant discussion capability only.

The connection disclosure explains that shared text enters recipient durable histories and may reach configured model providers different from the sender's. Committed delivery diagnostics appear beside their message with typed English or Chinese copy. The locally owned terminal follow condition uses a locale key in both Portal and Board; arbitrary server error text is preserved.

<a id="understand-the-implementation"></a>
## Understand the implementation

`data.ts` owns one authoritative complete Remote control view per viewed Session. `controlSnapshot` and `controlFollow` have identical human management visibility: all viewer-owned pairs and explicitly shared outbox records remain visible regardless of the peer snapshot/follow grants. The peer-facing channels retain their separate grant filters. A committed global revision gap replaces the entire UI view. Refresh rejects stale snapshots, and terminal failures create a fresh single-consumer logical stream. Feature disposal cancels and drains every stream before discarding subscribers.

The Portal registers into `shell.activity.selectors`. A store-free wrapper in `shell.app-overlay` waits for a selected Session before rendering Board through the strict `collaboration.board` child slot. This lets the blank shell mount safely before any Session exists. Portal and Board share one renderer-managed Session store handle for drafts, selection, open state and reading positions. No authoritative connection state lives in this store. Components receive renderer-bound observable hooks, JSON-compatible data and callbacks; no component receives Cordis context or subscribes directly to Remote services.

For a present live Session row, availability follows Session Controller running state even when the collaboration revision is unchanged. Without that row, the metadata observation retains its missing or unknown meaning. Portal unread counts derive from the current authoritative incoming outbox order after the connection's last-read message ID. Viewing a connection's details advances only that local reading position, including incoming messages while those details remain open. Complete view replacement determines the visible messages and counts; no message bodies or authoritative statuses are copied into the local store.

The native dialog supplies keyboard modality and Escape cancellation, focuses its close button and restores the opening control's focus. English and Chinese labels share a typed key set. Message bodies render as inert text, including Markdown and HTML-looking content. The custom Peer Definition claims durable attributed inputs; its reversible `chatInputs.excludeSource('collaboration-peer')` contribution prevents a duplicate generic row. Unload restores the generic attributed context presentation. AgentLoop preserves original required-policy source by exact input identity at the durable append boundary, so attribution also survives opening history pages that omit Inbox evidence.

<a id="further-exploration"></a>
## Further Exploration

- [Host collaboration](../../host/collaboration/README.md) documents state, delivery, grants and the same-user limitation.
- [Chat](../ui-chat/README.md) owns generic source-kind presentation exclusion.
- [Implementation note](../../../.agents/notes/implemented/feature/2026-10-03-session-discussion-ui.md) explains the approved shared-owner changes and alternatives.

<a id="dev-note"></a>
## Dev Note

Focused component, production Loader/renderer and HMR disposal tests cover blank-shell mounting followed by Session selection, the shared local store, original source fallback and stream cancellation. Assembly replay, recorded manifests, exported-entry smoke and the combined GUI gate belong to Task 10.

**Runtime invariant:** No companion is published. This plugin emits no domain events or authority; the existing committed Host aggregate, renderer registries and focused disposal tests enforce its boundaries.

<a id="model-experience"></a>
## Model Experience

### Durable Peer attribution

#### What the model sees

The reconstructed `user/message` keeps its original `collaboration-peer` source and listener-transformed content. This browser package adds no tools, prompt instructions or automatic forwarding; the [Host owner](../../host/collaboration/README.md#model-experience) defines the framed discussion body and grant-filtered tools.

#### Token effect

Browser state contributes no request tokens. Retaining `requiredAdmissionPolicy` and source identities does not duplicate the message or change its body.

#### KV Cache effect

No browser presentation state enters a provider request. Preserving source metadata does not append a second message or modify its text; provider adapters remain responsible for translating the same reconstructed messages.

## Known Limitations and Deferred Work

- The authenticated human control view assumes one human owns every Session on this Host. Sessions and same-user Gateway processes share OS credentials; this UI does not isolate action authority (Prerequisite P). It never reads private Session histories for connection display. Historical logs already written with a rewritten source cannot recover missing attribution from this UI alone. No data migration or new Session format is introduced.
