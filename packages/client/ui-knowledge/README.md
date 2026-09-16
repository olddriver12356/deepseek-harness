---
description: "Browse, distill, review, and approve Agent knowledge from the Knowledge panel."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-knowledge

English | [中文](README.zh.md)

## Summary

Knowledge lists real Agent Layer artifacts in Intake, Processed, and Knowledge · To learn. The persistent overlay retains its search and filter state when hidden. The Live Signal capture action saves the current conversation without calling a model, then opens Knowledge.

## Table of Contents

- [Runtime contract](#runtime-contract)
- [Data and asset boundaries](#data-and-asset-boundaries)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="runtime-contract"></a>
## Runtime contract

The plugin waits for `shell.overlay` and `shell.activity.capture` declarations through `ctx.slots.inject`. It loads records through the [Knowledge Remote](../../host/knowledge/README.md) when opened or refreshed. The reader renders Markdown through the existing untrusted-content renderer, with raw HTML and unsafe links disabled. Explicit actions distill, retry, shelve, restore, and review; errors remain visible. Promotion requires a destination preview and a separate unchecked approval box. Editing the destination discards the preview and approval.

Cards open a native modal reader immediately, with a sticky title, loading feedback, and errors inside the dialog. Boujoy's black header, square desktop border, blue shadow, and mobile bottom sheet frame a dark charcoal reading surface with warm light text and cyan links. Captured conversations show committed user and assistant text; raw evidence is fetched only on explicit request. Review and learning tags replace validation checklists. Accepted Knowledge must be marked learned before publication preview; the suggested destination remains editable. Related artifact links and Back navigate between sources and processed items. Refresh reloads the current document; closing preserves library selection and filters.

<a id="data-and-asset-boundaries"></a>
## Data and asset boundaries

Production does not consume `KNOWLEDGE_FIXTURE`; it remains test data. The Host reads canonical Session JSONL and delegates storage to the Vault's Agent Layer tool. The browser supplies identities and explicit owner decisions, never source evidence bytes or fabricated gate receipts. Acceptance stays inside Agents; publication uses a separate content-bound Remote operation.

No runtime invariant companion is published: the panel derives its display from Remote responses and owns no independent persistence state.

The collage and Fusion Pixel font are package-owned tracked assets referenced by relative CSS URLs. The client bundle emits their original bytes under `lib/assets`, and the registered-package module host serves only their simple PNG and WOFF2 filenames under `/plugins/@deepseek-ai/dsh-client-ui-knowledge/assets/`. `LICENSE-OFL` and `LICENSE-BOUJOY` preserve their attribution in the published package.

## Model Experience

None, as this browser package delegates model requests to the Knowledge Host and registers no model-facing input.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Publication scope**: new notes only, with a fresh filename and approval for later versions. Existing Vault notes are never overwritten.
- **Refresh scope**: open or refresh the panel to reload durable status; the reader does not stream model output.
- **Evidence scope**: capture preserves committed Session records, not transient streaming chunks or attachment bytes. The conversation view omits injected context, tool events, and non-text blocks; the complete log remains available. Relative Vault links are not navigable through the Markdown renderer; related artifact buttons provide source navigation.
- **Independent panel styling**: no generic application-panel framework exists. Shared code may be extracted after another real panel proves a stable repeated contract.

### Dev Note

No independent persistence state is owned by this panel.
