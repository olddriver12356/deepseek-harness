---
description: "Use Bok's About me page and private personal-memory tools inside DSH."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-personal

English | [中文](README.zh.md)

## Summary

Personal embeds Bok's original About me interface and Personal Core engine in DSH. The page provides profile, graph, review, evidence/results and cleanup views. The Host authenticates browser access, manages one Python process, and registers four personal-memory tools. Personal Markdown stays outside the project Vault and Git. Existing conversations and profile notes are not automatically imported.

## Table of Contents

- [Configuration](#configuration)
- [Runtime and data](#runtime-and-data)
- [Upstream source](#upstream-source)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Model Experience](#model-experience)

## Configuration

Requires Python 3.11 or newer, `webServer`, `connection` and `tools`. Activate this plugin through the Web profile's `insert` patch; the bundle manifest declares its resolver dependency but does not enable it by default. Configure `vaultRoot` for a dedicated Bok runtime Vault, `personalCoreRoot` for a separate private directory, `python` for the executable, and `requestTimeoutMs` for the process deadline. Explicit configuration authorizes initialization of that private root; Bok rejects unsafe locations and nonempty unmarked directories. Use `dshHomePath('bok-runtime')` and `dshHomePath('personal-core')` for machine-local sibling paths.

## Runtime and data

### Automatic conversation observation

Optional `observer` configuration requires the `llm` service and explicit `enabled`, `maxInputBytes`, `maxOutputTokens`, `maxOutputBytes`, `maxPendingTurns`, and `timeoutMs` values. About Me provides a persistent pause switch and status refresh. The saved switch in the local runtime's `dsh-observer.json` takes precedence over the initial configuration.

The observer listens to native `session/event` notifications and queues newly completed top-level human text turns at `turn/end`. Each eligible turn uses one separate model request on that turn's provider/model route. The exact request is recorded as `personal/observation-request`, with a content-free `personal/observation-result`; neither event enters the main conversation's model history. Original Bok signal validation, scoped credentials, evidence recording, quiet learning and protected-claim review remain authoritative. Shared Vault publication still requires separate owner approval.

Admission excludes sensitive text detected by Bok and explicit privacy markers or supported phrases such as `do_not_remember`, `session_only`, `external_content`, and “do not remember”. Extraction also instructs the model to ignore quoted material, temporary tasks and secrets, but natural-language filtering is not a guarantee; use the pause switch for private conversations. Non-text turns, subagents and restored history are excluded. A bounded serial queue skips overflow and has no replay after restart. Pausing cancels model work and drains outstanding work before acknowledging the switch. Each eligible turn incurs additional model usage within the configured limits.

The **Vault connection** button manages owner-approved Markdown projections in `Memory/Semantic/profile/` under `ideasVaultRoot`. Only effective, global records explicitly authorized for `all-agents` are eligible; sensitive records are excluded, and every export, including private-classified records, requires individual publication confirmation. Editing the statement in an exported note produces a preview; confirmation invokes Bok's original correction service under its re-entrant process lock with version and content checks. Conflicts never merge silently. The existing `Memory/Semantic/Profile.md` and all memory rotation rules remain unchanged.

After successful original UI mutations, withdrawn permissions or inactive claims retract their shared projections. Edited projections are first preserved privately. If the Vault guard blocks cleanup, the original operation remains successful and a warning invites cleanup retry through Vault connection. External Core changes are reconciled on opening the connection, not by a continuous watcher. Old Git revisions, Vault backups, and private recovery copies are not erased. Runtime baselines and recovery files live in the configured local Bok runtime and are outside original Bok backups; losing the baseline never permits overwriting unowned Markdown files. No existing memory is imported automatically.

The About Me document keeps Bok's five-view layout and interactions, with a DSH-specific stylesheet for dark surfaces, yellow selection, cyan accents, system typography, and matching edit/confirmation dialogs. The stylesheet is scoped to that document; the original quick-note popup and other DSH pages retain their styles.

`ideasVaultRoot` names the owner's separate Vault for quick notes. A persistent bottom-right button opens Bok's original quick-note window inside a modal without navigating away. Notes preserve the entered text and links in `Ideas/Draft/Quick note <UUID>.md`, with minimal capture metadata. The existing Vault sync guard runs before each write. A stable draft ID and atomic, no-overwrite publication make retries idempotent; changing text creates a new ID. Saving uses no model and does not create an Agent Knowledge or Personal Core copy. Local drafts retain the upstream 24-hour lifetime; a failed save leaves the draft intact. This writer requires Windows PowerShell and the Vault's existing guard script.

The browser panel occupies `shell.app-overlay` and opens `/personal/` lazily. It remains mounted when hidden so a correction draft survives navigation. The isolated document keeps Bok's page styles, five views, dialogs, graph and state transitions. An embedding stylesheet hides duplicate navigation, the unrelated Vault sidebar and quick-note launcher. Full About me content remains available.

The Host uses Connection's authentication and Host/Origin checks before serving assets or forwarding the explicit Personal Core browser routes. Bok's owner token never reaches the browser. The Python process runs the original Bok HTTP service on an authenticated ephemeral loopback port. Browser requests retain the upstream route allowlist, request limits and idempotency handling. DSH tools use a separate `dsh` Agent credential limited to context, conversation observation, impact and outcome access. Plaintext stays in process memory; only its hash is persisted. Revocation is checked on each call and survives plugin restart. Re-enabling revoked access requires an explicit owner credential action; restart does not undo it.

Claims, Observations, Impacts, Outcomes, history and backups use Bok's original Markdown/metadata formats in `personalCoreRoot`. The separate runtime Vault contains the conversation ledger, credential hashes and reconstructable state. Do not point `vaultRoot` at an existing knowledge Vault merely to make the page show old cards. The worker is the shared owner for UI and tool operations and shuts down with the plugin; a deadline stops the process, so refresh state before retrying a mutation whose response was interrupted. No independent invariant export exists because the adapter holds no second copy of personal-memory state.

## Upstream source

The pinned source is [Bok](https://github.com/asen-goat-mine/bok/tree/d556bfc918224712a1c0bc9660e04c829c8f7702), commit `d556bfc918224712a1c0bc9660e04c829c8f7702`. `vendor/bok` retains Apache-2.0 LICENSE and NOTICE plus the font's OFL license. Python engine files are unmodified. The browser script carries a modification notice: initialization selects Personal Core, requests use the authenticated DSH path, and visibility refreshes the dashboard. DSH owns the process adapter and embedding stylesheet.

## Known Limitations and Deferred Work

The original embedded content is Chinese; the surrounding DSH navigation is localized. This integration requires the Web profile and Python, not the port-free Electron transport. It supplies memory tools but does not silently sweep old sessions or inject the entire personal store into every model request. Observations require structured evidence, supplied by explicit tool use or the optional automatic observer; the page starts empty. Independent cross-agent clients and credential administration remain Bok API/CLI operations. The upstream symlink-rejection test requires OS permission to create symlinks on Windows.

## Model Experience

### Request context and condition

#### What the model sees

When enabled, the tool registry exposes `bok_person_context`, `bok_observe_conversation`, `bok_record_person_impact` and `bok_record_person_outcome` using Bok's original schemas and descriptions. The `agent` field is fixed to the authenticated `dsh` identity. Read context for a relevant task, submit only evidence-backed structured interpretations of actual user turns, and record claims actually used and later feedback. Respect `external_content`, `session_only` and `do_not_remember`; protected claims need owner confirmation and separate access authorization.

#### Token cost

Four tool descriptions and schemas are registered. Context results are bounded by Bok's requested limit and token budget. Observation responses use the original compact acknowledgement; they do not echo raw user text. Exact serialized token counts depend on the active model tokenizer and tool presentation mode.

#### KV Cache effect

The static tool schema prefix is stable while the plugin is active. Memory is returned through ordinary logged tool results; the adapter adds no hidden model-visible state or unconditional dynamic prompt prefix. Personalization changes only subsequent tool results and decisions that use them.

### Dev Note

The adapter persists only the observer switch and existing Vault projection bookkeeping; Personal Core remains the memory authority.
