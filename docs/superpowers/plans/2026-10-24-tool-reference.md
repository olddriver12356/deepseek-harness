# Tool Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` for native inline execution or `subagent-driven-development` if the owner explicitly selects it. Implement task-by-task with test-first checks. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Commands, MCP, and Hooks tabs a useful read-only personal reference with complete first-party command manuals, actual scoped runtime observations, and a Skills-style hook-type filter.

**Architecture:** Extend the current plugin-inventory owner with a narrow optional reference-contribution registry and lazy read-only Remote methods. Command owners supply manuals, MCP owners supply connection/discovery snapshots, and optional experimental hook adapters supply their parsed handler registrations. The existing Tool panel renders these observations through framework resources; none of this enters model prompts or execution policies.

**Tech Stack:** TypeScript ESM, Cordis effects and `ScopedLayers`, Typert Remote generation, React, DSH resource/slot services, CSS Modules and semantic tokens, typed EN/ZH dictionaries, Vitest and shipped-profile Web replay.

**Spec:** [Tool Reference Page Design](../specs/2026-10-24-tool-reference-design.md).

## Summary

This is an implementation proposal, not a statement of shipped behavior. Tasks run in order because the provider and Client changes consume the shared scoped reference interface. Each task has its own failing test, minimal implementation and verification cycle.

## Table of Contents

- [Global constraints](#global-constraints)
- [Review focus](#review-focus)
- [File structure and interfaces](#file-structure-and-interfaces)
- [Task 1: Scoped reference contributions](#task-1-scoped-read-only-reference-contributions)
- [Task 2: Command manuals](#task-2-source-owned-command-usage-manuals)
- [Task 3: MCP reference](#task-3-accurate-mcp-server-and-tool-reference)
- [Task 4: Hook registrations](#task-4-individual-hook-registrations-and-type-metadata)
- [Task 5: Reference UI](#task-5-dsh-native-reference-ui-and-hook-filter)
- [Task 6: Integration evidence](#task-6-shipped-composition-no-session-cost-and-integration-evidence)
- [Execution handoff](#execution-handoff)

## Global Constraints

- The mockup specifies information and interactions only. Real DSH styling, primitives, spacing, focus and responsive conventions override it; do not copy the prototype's palette, hero, decorative marks or custom controls.
- Commands, MCP, and Hooks are read-only reference views. Preserve existing Skills, Plugins, editing and creation handoffs. Copying text never executes, submits or inserts it.
- No model request, prompt/schema contribution, Session event, automatic Agent creation/resumption, periodic polling, provider discovery request, reconnect or hook execution occurs because someone browses this page.
- Preserve Host versus exact live Agent scope. A selected preset or persisted Session is not evidence that its commands/tools are currently active.
- Documentation is source-owned, optional for extensions and honest about missing data. Never infer a command grammar from its input hint, a server connection from plugin activation, or a hook's last run from a different handler.
- No raw environment maps, headers, credential-bearing URLs, config blobs, hook commands, executable arguments, stdout/stderr, or tool argument values may cross the reference wire boundary.
- Stable product packages must not depend on experimental hook packages. The adapters contribute through an optional stable interface; no adapter is added to shipped defaults.
- Keep Session event schemas and historical snapshots unchanged. Use current-format authored fixtures for new cases. Browsing must not append history.
- Preserve the unrelated dirty primary checkout and retained worktrees. Do not stage all changes, merge, push, restart the running GUI, or delete worktrees. Prepare execution isolation only after the owner approves this plan.

## Review Focus

1. A cold or different Session must not materialize an Agent or leak another Agent's capabilities. Task 1 tests the live lookup and scoped filtering; Task 6 pins it through the real browser.
2. A loaded MCP plugin can be disconnected or synchronizing. Task 3 tests connection loss, generation replacement and atomic tool registration failure without implying connection health from fiber state.
3. Several hook commands can share an event and matcher while historical IDs are per invocation. Task 4 tests distinct handler rows and unavailable individual history rather than guessed correlation.
4. Secrets can hide inside configuration errors, command strings and nested provider metadata. Tasks 1, 3 and 4 test explicit output allowlists; Task 6 tests inert external content and metadata rendering.
5. A late detail response after a type, Session or workspace change must not replace the current selection. Task 5 tests request cancellation, source disposal and no-results behavior.

## File Structure and Interfaces

Keep implementation in existing owners; do not add a new package, HTTP server or generic plugin-configuration browser.

| Owner | Files | Responsibility |
|---|---|---|
| Reference read model | Create `packages/host/plugin-inventory/src/reference-types.ts`, `src/references.ts`; modify `src/index.ts`, `src/types.ts` | Scoped contribution lifetimes, sanitized summary/detail values, read-only gateway, notification |
| Command manuals | Modify `packages/interaction/commands/src/{types,index}.ts`; create owner-local `src/reference.ts` in each first-party command package listed in Task 2 | Optional bilingual guide, lazy lookup, immutable metadata, no grammar changes |
| MCP observation | Create `packages/mcp/mcp-client/src/reference.ts`; modify `src/{index,connection,tools,server-context}.ts` | Current supervisor/discovery snapshots, no network read on browse |
| Hook observation | Create `src/reference.ts` in each existing Claude/Codex hook adapter; modify their `src/index.ts` | Parsed handler references with actual adapter semantics, no new execution tracking |
| Tool reference UI | Create `packages/client/ui-skill/src/client/{reference-types,reference-resources}.ts`, `{ReferenceCatalog,CommandReference,McpReference,HookReference}.tsx`, `ReferenceCatalog.module.css`; modify `SkillsPanel.tsx`, `panel-plugin.ts`, `panel-locales.ts` | Resource-backed reference list/detail, safe schema display, hook filter, copy-only examples |
| Remote assembly | Modify `packages/api/remotes/src/remote-events.ts` and required manifests/references | Forward reference invalidation through the existing authenticated transport |
| Evidence | Add focused tests in each owning package; add `apps/web/tests/tool-reference.e2e.ts`, owner-local ARIA oracles, and `snapshots/web/tool-reference/` | Lifecycle, wire, assembled UI, no Session/model cost |

All new exported contracts have owner-local JSDoc. Runtime helpers stay private unless another current consumer requires them. Update only the dependent manifests, TS references and generated Remote artifacts required by these changes. Regenerate, never hand-edit generated catalogs. Local feature documentation remains English-only with precise pairing exclusions; preserve and update upstream-owned EN/ZH pairs under the local integration policy.

Every task consumes the current [architecture](../../architecture.md), [defensive patterns](../../defensive-patterns/README.md) and [testing policy](../../testing.md). Task 5 additionally consumes [Web styling](../../web-styling.md) and the `dsh-client-ui-ux`/`dsh-responsive-ui` skills. Product implementation loads TDD and relevant owner skills before editing.

### Shared reference vocabulary

Define the following contracts in `reference-types.ts`, re-exported type-only through the inventory's existing `./types` face:

- `ReferenceLocale = 'en' | 'zh'` is declared in `packages/interaction/commands/src/types.ts` and re-exported type-only by the inventory reference contract. This dependency points from Host inventory to the command definition owner, never in reverse.
- `ToolReferenceId = Branded<'ToolReferenceId'>`; IDs are minted by the inventory registry and are opaque to the Client.
- `HookType = 'session' | 'prompt' | 'tool' | 'turn-completion' | 'subagent'`.
- `ReferenceScope = { kind: 'host' } | { kind: 'session'; sessionId: SessionId }`; configured preset rows retain their existing inventory representation and are not synthesized into live handler/server references.
- `ToolReferenceSummary`: `id`, `kind: 'mcp' | 'hook'`, `name`, `description`, `scope`, `moduleName`, `documentation: 'supplied' | 'partial' | 'missing'`, and kind-specific safe state. Hook summaries include `types: readonly HookType[]` and `events: readonly string[]`. MCP summaries include the connection state from Task 3, independently of optional Loader activation metadata.
- `ToolReferenceDetail`: discriminated MCP/hook union containing the summary plus safe owner-supplied content described in Tasks 3 and 4. No arbitrary plugin `config`, error object or executable field belongs in this type.
- `ReferenceListRequest = { sessionId?: SessionId; locale: ReferenceLocale }` and `ReferenceDetailRequest = ReferenceListRequest & { id: ToolReferenceId }`.
- `ToolReferenceSnapshot`: `observedAt` epoch milliseconds, `sessionAvailability: 'live' | 'not-live' | 'not-selected'`, `commands: readonly CommandDescriptor[]`, and independent `mcp`/`hooks` section results. Each section is either `{ kind: 'ready'; items }` or `{ kind: 'unavailable'; code: string }`. Commands are empty when the selected Agent is not live, with `sessionAvailability` explaining why.
- `ReferenceContribution`: `kind`, safe `moduleName`, `summary(locale): ...`, `detail(locale): ...` callbacks. The registry derives scope from the registration context and mints the identity; callbacks do not choose arbitrary Session scope. Use exact kind-specific return types rather than a config bag.

Publish `registerReference(contribution): () => void`, Remote `referenceList(request): Promise<ToolReferenceSnapshot>`, and Remote `referenceDetail(request): Promise<ToolReferenceDetail | null>` on the existing inventory service. Each contribution optionally supplies `subscribeChanged(listener: () => void): () => void`, letting the source owner notify committed snapshot changes without the registry owning a second cache. Registration returns the exact `ctx.effect` disposer, captures scope at entry, and owns the subscription's cleanup. Notifications are ignored after removal. Reference reads use `ctx.agents.get(sessionId)` only; never resume, open or compose an Agent. A detail request for an out-of-scope or disposed ID returns null without invoking its callback. A provider callback failure produces an unavailable result for that provider, not failure of unrelated sections; expose stable error codes, not thrown diagnostic text.

Add `plugin-inventory/references-changed` as a typed emit event carrying the optional affected Session identity. Forward it with resource-aware authorization through the existing Remote event assembly. Follow current Remote resource authorization conventions for both reference methods; a guessed Session ID or reference ID must not bypass Session access control.

## Task 1: Scoped Read-Only Reference Contributions

**Files:** the inventory files above; `packages/interaction/commands/src/types.ts` for the shared `ReferenceLocale` and `CommandUsageGuide` type declarations consumed by the gateway; `packages/host/plugin-inventory/tests/{inventory,references}.spec.ts`; `packages/api/remotes/src/remote-events.ts`; the relevant README pair, subsystem generated declarations, package and compiler references.

**Consumes:** existing Cordis effect ownership, `ScopedLayers`, `scopeOf`, live Agent registry, command registry and Remote resource authorization. These are optional reads where the Host composition can omit the service.

**Produces:** the shared contracts and exact registry/Remote methods above, with independent provider failure containment and invalidation. Loader `list()` behavior remains unchanged.

- [ ] **1. Write failing tests.** Register Host and two Agent contributions; `referenceList({sessionId: A, locale:'en'})` returns Host plus A and never B. A request without Session returns Host only. A cold Session read leaves the Agent count and Session event count unchanged. An out-of-scope detail ID never calls its provider. Disposal removes the item and a late provider notification cannot republish it. A throwing provider leaves another provider and Commands usable. Serialize the result from a fixture containing sentinel secrets only in excluded config; none occur in the payload.
- [ ] **2. Run RED.** `pnpm exec vitest run --maxWorkers=2 packages/host/plugin-inventory/tests/references.spec.ts`; expect missing reference methods/assertions to fail, not startup fixture errors.
- [ ] **3. Implement the registry and gateway.** Reuse `ScopedLayers` for registration ownership; keep callbacks synchronous snapshots so browsing never triggers IO owned by a provider. Preserve remote authorization on Session-addressed requests. Emit changes after registration/removal commits. Validate model/file/wire inputs at their owning boundaries, not typed same-process callbacks.
- [ ] **4. Run GREEN and lifecycle coverage.** `pnpm exec vitest run --maxWorkers=2 packages/host/plugin-inventory/tests packages/api/remotes/tests`; confirm existing plugin inventory is unchanged, provider failure stays local, and unload removes contributions. Add a real Loader fixture using the existing test infrastructure, not only direct service mounting.
- [ ] **5. Update owning docs and create a narrow task commit** only after reviewing exact changed paths. Do not include prior dirty changes to unrelated owners. If base changes are needed, record and import their exact patch in the execution worktree rather than blanket-stashing primary.

## Task 2: Source-Owned Command Usage Manuals

**Files:** `packages/interaction/commands/src/{types,index}.ts`, `tests/commands.spec.ts`; create `src/reference.ts` in `packages/compaction/command-compact`, `packages/feedback/command-feedback`, `packages/goal/command-goal`, `packages/goal/long-term-progress`, `packages/plan/plan-mode`, `packages/interaction/permission-presets`, `packages/session/command-clear`, `packages/session-query/session-log-export`; update each registration and its existing tests/README. Inventory the real shipped standard command set before marking this task complete.

**Consumes:** Task 1's live Agent lookup and locale convention; existing command scope/shadowing and handlers.

**Produces:** optional `CommandDefinition.reference: Readonly<Record<ReferenceLocale, CommandUsageGuide>>`; lightweight descriptor `hasReference?: boolean`; `CommandRuntime.reference(agent: Agent, name: string, locale: ReferenceLocale): CommandUsageGuide | null`. Add Remote `pluginInventory.commandReference({sessionId: SessionId, name: string, locale: ReferenceLocale}): Promise<CommandUsageGuide | null>` so cold reads use the same nonmaterializing guard as Task 1.

`CommandUsageGuide` contains `purpose`, `when`, `syntax`, an explicit `arguments` union (`{kind:'none'}` or `{kind:'documented'; items: readonly {name: string, description: string, required: boolean, defaultValue?: string, acceptedValues?: readonly string[]}[]}`), `subcommands` with name/syntax/description and command-specific argument notes, `examples: readonly {title: string, input: string, expectedResult: string}[]`, `effects: readonly string[]`, and `limitations: readonly string[]`. Declare this type and `ReferenceLocale` in the command owner's existing client-safe type face. Missing guide is null, never a made-up guide based on a hint. The command owner must not runtime-depend on the Host gateway.

- [ ] **1. Write failing tests.** A command's scoped shadow supplies its own guide, not the global guide. `commands.list` contains only `hasReference`, never full manuals. Mutating the original supplied guide cannot alter the normalized registered guide. An extension without a guide returns null. Verify no model schema or Session events are produced by a guide read.
- [ ] **2. Run RED.** `pnpm exec vitest run --maxWorkers=2 packages/interaction/commands/tests/commands.spec.ts packages/host/plugin-inventory/tests/references.spec.ts`.
- [ ] **3. Add immutable guide storage and lazy lookup.** Reuse the command normalization boundary to snapshot/freeze metadata. Keep command handlers and parsing untouched. Supply EN/ZH manuals beside each first-party registration. Dynamic permission names are described as profile-dependent, not copied into a fixed enum. Goal and plan guides reflect the actually selected execution baseline; do not accidentally reintroduce obsolete JSON draft syntax or claim approval starts execution.
- [ ] **4. Test every documented grammar branch through its real handler.** Cover defaults, no-argument commands, invalid parameters, optional input and current subcommands. For each example use controlled files/services and assert the described result or effect; no tests call live production commands. Run the affected owning command test files, then the command registry suite. Require all standard Web command descriptors to have a guide in the assembled test in Task 6.
- [ ] **5. Update command contract docs and generated API declarations, then review and commit only this task.** Reference metadata is UI-only and must not enter command lifecycle records or model prompts.

## Task 3: Accurate MCP Server and Tool Reference

**Files:** `packages/mcp/mcp-client/src/{reference,index,connection,tools,server-context}.ts`; `tests/{reference,reconnect,server-context,mcp-client}.spec.ts`; owning README pair and required manifests/compiler references.

**Consumes:** Task 1's optional `ctx.get('pluginInventory')` contribution; existing connection supervisor, serialized tool sync, `publicToolName` and MCP SDK discovery response.

**Produces:** a readonly `ConnectionHandle.reference(): McpReferenceSnapshot` alongside existing resources/instructions. `McpReferenceSnapshot` exposes `state: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'failed'`, transport label, literal attributed server instructions from the existing instructions snapshot, `toolsAvailability: 'current' | 'unavailable'`, and tool summaries from the last committed registration generation. Detail tool records contain public/raw name, provider description, original input schema, optional output schema and recognized annotations only. No endpoint, arguments or environment is returned. On disconnect this implementation omits tool details and reports unavailable; it does not retain apparently live stale tools. Existing execution registry behavior is not changed merely to match the reference policy.

- [ ] **1. Write failing tests.** Initial connection is connecting until negotiation and discovery settle. A plugin that activates after a contained startup failure is not connected. A connected zero-tool server remains connected with an empty list. Disconnect makes reference tools unavailable while existing reconnect policy behaves unchanged. A failed discovery preserves the prior committed snapshot on the same connection; registration rollback exposes no partially registered tools. Read `reference()` repeatedly and assert the fixture MCP server receives no extra list/call/connect requests.
- [ ] **2. Run RED.** `pnpm exec vitest run --maxWorkers=2 packages/mcp/mcp-client/tests/reference.spec.ts packages/mcp/mcp-client/tests/reconnect.spec.ts`.
- [ ] **3. Capture safe metadata at the existing successful sync commit.** Extend `syncTools` with an owner callback/result that carries the safe metadata from the response already fetched; do not fetch discovery again and do not reverse-parse public tool names. Update all `syncTools` callers/tests together. Derive connection state at supervisor transitions without creating another reconnect state machine. Keep full metadata outside `ToolDefinition` if only the reference consumes it; preserve registered model schemas exactly.
- [ ] **4. Register the optional contribution in the server plugin effect.** Provider invalidation follows committed state/tool-generation changes; unloading invalidates then unregisters and drains existing supervisor operations. If the inventory service is absent the MCP bridge behaves exactly as before. Avoid a mandatory install edge from the model tool path to a GUI-only package; follow the repo's optional service dependency rules.
- [ ] **5. Run GREEN, security and real composition checks.** Use the existing owned HTTP/stdio fixtures to test reconnect and HMR; inspect payloads for secret sentinels in URLs, env, transport failures and custom metadata. Whitelist recognized schema/documentation fields instead of returning SDK response/config wholesale. Update the README and commit narrowly.

## Task 4: Individual Hook Registrations and Type Metadata

**Files:** create `packages/experimental/hooks-claude-code/src/reference.ts` and `packages/experimental/hooks-codex/src/reference.ts`; modify both `src/index.ts`; add owner `tests/reference.spec.ts` and extend existing parse/load/lifecycle tests; update README pairs and optional dependency declarations.

**Consumes:** Task 1's stable optional contribution interface and each bridge's already-parsed event/matcher/command groups. No stable package imports either adapter.

**Produces:** one reference per configured command handler, identified by an opaque source-instance/event/group/hook ordinal identity. Public values include adapter, event, `types`, safe ordinal label, matcher, registered/enabled state, adapter-specific trigger explanation and honored effects. The implementation does not expose or hash raw command strings as display identity. Distinct configured handlers stay distinct even if their commands are equal.

Initial `lastExecution` is `{kind:'unavailable'; reason:'uncorrelated-history' | 'not-recorded'}` because existing invocation IDs are not configured-handler IDs. Do not add a durable event or a new in-memory run history. Explain trigger timing fully even when last execution is unavailable. A future correlated-record variant is outside this plan.

- [ ] **1. Write failing tests.** Two PreToolUse handlers with the same matcher appear as two safe entries. Map Claude's seven supported events to the five exact type values; map Codex only to its supported events. Unsupported/skipped config creates no active registration. SessionStart and subagent lifecycle details do not claim durable run records. Seed an unrelated existing hook/result and assert it is not attributed to a registration. A secret-bearing raw command/config error never appears in catalog/detail output.
- [ ] **2. Run RED.** `pnpm exec vitest run --maxWorkers=2 packages/experimental/hooks-claude-code/tests/reference.spec.ts packages/experimental/hooks-codex/tests/reference.spec.ts`.
- [ ] **3. Publish metadata from the same successful parse/registration path as execution listeners.** If parsing fails, contribute an adapter-unavailable summary without raw error details; do not represent zero hooks as healthy. Each detail correctly distinguishes UserPromptSubmit admission, PreToolUse, PostToolUse, stopping boundary and subagent behavior. Publish EN/ZH trigger/effect text selected by the requested locale; keep event and matcher literals verbatim. Configured-but-unloaded adapters retain only the existing plugin inventory row; do not read config files a second time to fabricate live handlers.
- [ ] **4. Run GREEN and disposal checks.** Register/unregister through real Loader composition with an optional test overlay, never shipped defaults. Disposing the adapter removes every handler reference and leaves existing hook timeout/decision behavior unchanged. Confirm browsing adds no hook invocation/result or model-context events. Update the owning docs and commit narrowly.

## Task 5: DSH-Native Reference UI and Hook Filter

**Files:** the Tool reference Client files in the structure table; existing `tests/skills-panel.client.spec.tsx`; create `tests/{reference-catalog,command-reference,mcp-reference,hook-reference}.client.spec.tsx` and `tests/reference-resources.client.spec.ts`; existing package manifest/compiler declarations and README pair.

**Consumes:** Tasks 1–4 Remote values and change notifications, existing `commands/change` and Session/preset notifications, shared `MarkdownText`, Copy controls, select/menu primitives, and `useResource`.

**Produces:** registered `tool-reference` resource protocol and `ReferenceCatalog` inserted at the existing non-Skills/non-Plugins catalog area. Resource addresses encode Host/Session scope, locale, selected reference and an explicit refresh generation; use URL encoding and typed address parsing. Manual refresh advances that page-local generation and releases superseded sources. Include the selected preset in resource identity and cancel on preset changes, but do not send it as evidence of a live registration. The provider uses the existing remote event bridge, not timers. `ReferenceCatalog` receives derived slot props and uses framework `useResource`; no new `useSyncExternalStore`, service-bearing props, subscription hooks or effects synchronizing parent state. Existing Skills editor behavior is not refactored as collateral work.

- [ ] **1. Write failing user-facing tests.** Commands show readable arguments/subcommands/examples and missing-guide states. Copy updates feedback without invoking a command or submitting text. MCP renders connection and activation separately, complex schemas honestly and descriptions as safe inert content. Hooks render a flat list with **Hook type / All types / Session / Prompt / Tool / Turn completion / Subagent** (and corresponding Chinese labels). Tool filters include PreToolUse and PostToolUse, and search combines with the filter. Multiple matching types do not duplicate one logical row. Empty results clear the detail. Unknown execution history is not presented as a timestamp or success.
- [ ] **2. Run RED.** `pnpm exec vitest run --maxWorkers=2 packages/client/ui-skill/tests/reference-*.client.spec*` and new per-detail specs; use the actual file names if the shell does not expand that filter.
- [ ] **3. Implement the resource provider and focused components.** Invalidate only open resources affected by a Session or Host contribution change. Session changes abort old reads; late responses cannot publish a current frame. Read each documentation body only when selected. A failed provider/detail affects its own row/pane and leaves the other sections usable. Show localized actionable errors, not raw thrown messages. Show source and selected Session/preset, distinguish unavailable observation from missing documentation, and format `observedAt` in the user's timezone as observation time rather than last success. Known disabled configuration rows retain their disabled/conditional Loader status with runtime availability explicitly unverified; keep these rows separate from actual MCP/hook contributions and never invent handler metadata. Prefer omitting schema property detail that cannot be represented faithfully and link to collapsed raw schema instead; never follow external `$ref` or auto-fetch URLs.
- [ ] **4. Apply actual DSH design rules.** Read current Web styling and primitives before choosing controls. Use semantic surface/text/border/state tokens, standard typography and spacing, existing select/copy/focus behavior, no prototype colors/decorations and no third-party UI kit. Use typed locale keys for all UI copy. Provider text and syntax remain verbatim. Wide detail may have an on-page contents list; small widths use a single readable pane without horizontal page overflow. Keep editor styling outside the new reference scope unchanged.
- [ ] **5. Run GREEN including resource races.** Drive controlled Remote promises: start A, select B, resolve B then A, and assert B remains visible. Remove a contribution while its detail is loading and assert it cannot reappear. Verify observers disappear on resource release/disposal. Render both locales, keyboard filter/selection/copy flow and long nested schema/long tool names. Run existing Skills and creation-handoff tests unchanged, scoped lint/i18n checks, then update README and commit narrowly.

## Task 6: Shipped Composition, No Session Cost, and Integration Evidence

**Files:** create `apps/web/tests/tool-reference.e2e.ts`, `apps/web/tests/expected/tool-reference/*.expected.md`, `snapshots/web/tool-reference/` with `snapshot.yml`, `cordis.yml` and the Session JSONL named for the checkout's current writer and any required header sidecars. Register/exclude the Host browser test in `tsconfig.host.json` and `apps/web/tsconfig.json`. Update affected generated Remote API assemblies, subsystem references, translation records and upgrade guide if an existing published surface is changed incompatibly.

**Consumes:** Tasks 1–5 in shipped Web composition, the existing Web scaffold/Loader and deterministic external MCP fixtures.

**Produces:** browser evidence of the approved information/interaction design inside the actual DSH shell, plus a keyless recorded Session demonstrating that browsing does not alter the Agent's input.

- [ ] **1. Add the failing real-Web scenario before wiring final composition.** Boot the standard shipped profile via the existing scaffold with optional test-only external MCP/hook fixtures. Create one ordinary recorded Session through public UI. Capture Session seq and external model-request count after its turn settles. Browse Commands, MCP tool detail and Hook type filters, search, copy, refresh and switch tabs; assert both counters remain unchanged. Read a cold Session catalog through the authorized Remote and assert it stays cold. Do not fake hook/supervisor state inside the UI.
- [ ] **2. Cover runtime transitions and privacy in the browser.** Fixture disconnect changes connection state without showing plugin failure as a substitute; tool detail becomes unavailable. Unloading the hook overlay removes handler references. Malicious provider Markdown cannot execute scripts or request remote assets; URLs containing secret sentinels never appear. All standard command registrations have complete guide metadata; extension-only metadata renders the explicit missing-guide state.
- [ ] **3. Record then replay only the new authored scenario.** `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/tool-reference.e2e.ts`, then the same command with `DSH_SNAPSHOT=replay`; set environment variables using the host shell's native syntax. Keep UI/ARIA oracles owner-local and Session records under the scenario. Review normalized events and headers rather than auto-accepting generated files.
- [ ] **4. Verify the real design context.** Inspect the assembled page in the DSH shell, not the standalone mockup; compare layout, surfaces, controls, spacing, typography, focus and narrow-width behavior with neighboring pages. Capture owner-local screenshots/ARIA as needed. A replacement development server does not update the user's existing GUI; do not promise HMR without its existing watcher.
- [ ] **5. Run the narrow final check set.** Reuse earlier passing focused checks rather than rerunning for ceremony; run `pnpm run test:gui` for the integrated Client changes, relevant new Web replay, owner lint and locale/doc pairing checks. Run `pnpm run build:artifacts` then `pnpm run build:check` against the final source. If unrelated baseline failures remain, report exact owners and do not silently fix or claim all checks passed. Review the final diff for secrets and unrelated changes, then create only the approved task commits.
- [ ] **6. Deliver implementation evidence and activation boundary.** Report what is implemented, observed command coverage, MCP/hook missing-data limitations, actual tests, build results and unresolved defects. Do not restart, merge or push without the owner's separate instruction. Chat tool-name reference links and durable per-handler run identities remain deferred.

## Execution Handoff

The owner approved the design, including the rule that the mockup is informational only and the real UI must comply with overall DSH design. The preceding parent work used inline execution for cost control, but this fork has not selected a method for this plan. Recommend native inline implementation because the reference registry, provider data and UI depend on one shared interface; independent contexts per small task would repeat substantial setup. Ask the owner to review this plan and select native or subagent-driven execution before making product code changes.

The primary checkout has existing uncommitted long-term-progress, chat, Personal, clear-command and Session-format work. A new execution worktree must begin from an explicitly reviewed baseline; if it needs uncommitted owner changes, transfer only the exact required files/hunks with a preservation record and verify no overlap. Retain the parent's worktrees. The existing visual companion is disposable and is not a supported product server.
