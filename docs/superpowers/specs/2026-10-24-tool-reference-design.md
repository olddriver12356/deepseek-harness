---
description: "Proposed read-only Commands, MCP, and Hooks references with source-owned manuals, scoped availability, and lifecycle-type filtering."
---

# Tool Reference Page Design

## Summary

This is a proposed design, not documentation of shipped behavior. The Tool page helps its owner recognize capabilities, understand how to use them, and distinguish configuration from actual availability. It expands the existing Commands, MCP, and Hooks directories without adding model requests, prompt context, automatic executions, or another management console. The owner approved the overall reference layout and requested a Skills-style Hook type filter instead of grouped lifecycle headings. Product implementation follows approval of this written design and an implementation plan.

## Contents

- [Intent and boundaries](#intent-and-boundaries)
- [Shared interaction](#shared-interaction)
- [Commands](#commands)
- [MCP](#mcp)
- [Hooks](#hooks)
- [Sources and implementation direction](#sources-and-implementation-direction)
- [Cost, privacy, and failure handling](#cost-privacy-and-failure-handling)
- [Acceptance criteria](#acceptance-criteria)
- [Builder decisions](#builder-decisions)

## Intent and boundaries

The reader is the product owner looking up a forgotten command, MCP tool, or hook. The page answers what a capability does, when it is useful, how it is used, what effects it can have, and whether it is currently available. Developer setup instructions are secondary to usage instructions. Raw JSON is an optional advanced view, never the primary manual.

The first implementation covers the existing Commands, MCP, and Hooks tabs. Skills, Plugins, their editing flows, and existing creation handoffs retain their current behavior. The page remains read-only with respect to commands, MCP connections, and hooks. Copying an example copies text; it never inserts, submits, or executes it. Chat tool-name links are deferred. No new agent planner, background documentation generation, telemetry subsystem, synthetic health checks, hook runner, or MCP connection manager is included.

This work does not modify the separate long-term-progress behavior or activate its pending patches. Investigation Session identifiers retained by the parent work remain unrelated to this page.

## Shared interaction

The mockup is a low-fidelity representation of information and interaction, not a visual specification. The real DSH design system is authoritative over the mockup and any existing page-specific styling that conflicts with it. Follow [Web styling](../../web-styling.md), the current shared semantic tokens, existing component primitives, and established DSH typography, spacing, surfaces, controls, focus states, and responsive behavior. Do not preserve the prototype's dark green and paper palette, literal colors, hero treatment, decorative marks, or custom control styling merely because they appear in the mockup. Reuse the existing Tool panel's list/detail interaction where compatible with those rules.

Search remains above the catalog list. The detail pane uses a readable document hierarchy: summary, scoped status, usage, examples, effects, and limitations. A compact on-page contents list may appear on wide screens; it disappears when space is insufficient. Product implementation uses typed EN/ZH locale dictionaries and standard resource hooks. Validate the assembled page against the actual DSH shell and neighboring pages, not pixel matching against the standalone prototype.

Show the selected Session and preset when they affect availability. A command is available only when registered for that Session; do not infer availability from installation. Viewing a persisted Session must not resume or make its Agent live solely to populate this page. Without a live Session, session-specific availability says that it cannot currently be verified; Host inventory remains readable where supported.

Manual content loads when an entry is selected. A list response contains only summaries and state required for browsing. Refresh re-reads existing state; it does not reconnect, retry a failed hook, or call a provider tool. Reuse existing change notifications to invalidate visible resources. Do not add periodic polling. Display observation time for status snapshots, without implying that observation time is a last-success time.

Search and filters combine. When the current selection leaves the visible results, select the first remaining entry; when none remain, show an empty detail state rather than an unrelated stale selection. Switching Session or preset cancels obsolete detail reads. A stale asynchronous response cannot replace the current selection. Search and selection remain page-local; persistent preferences are out of scope.

## Commands

Each command shows its literal slash name, description, owning source, Session availability, and documentation completeness. Its manual contains purpose and appropriate use, exact syntax, parameter meanings and required/optional status, declared defaults and accepted values, supported subcommands, examples with expected results, and relevant effects or limitations. Call out model use, destructive effects, required confirmation, and Session changes where applicable.

The command owner supplies the guide. Command parsing remains in its existing handler; the reference does not introduce a second parser or pretend that an unstructured input hint is a complete parameter schema. Parameter and subcommand documentation is explicitly authored and tested against the handler. An explicit declaration that a command takes no arguments is distinct from missing argument documentation.

Provide full owner-authored guides for the first-party commands registered by the shipped standard Web composition, including their current subcommands. Inventory that command set at implementation time instead of hardcoding a count in this design. Extension commands without guide metadata still show their actual description and input hint, with “No complete usage guide supplied.” Do not generate guessed examples. A guide can omit inapplicable sections explicitly, and examples must identify placeholder IDs or revisions that the user must replace.

## MCP

The server entry separates three facts: plugin activation, server connection, and tool availability in the selected Session. Connected means the existing connection supervisor reports a usable negotiated connection; plugin fiber activation alone does not establish this. Represent disconnected, connecting/reconnecting, failed, disabled, and unknown distinctly when the source can distinguish them. Do not invent finer states from a plugin name or error string.

Show server namespace and a safe transport label, followed by exposed tool names and descriptions. Selecting a tool opens its manual within the server detail. Display provider-supplied input descriptions, required fields, types, defaults, enumerations, and nested structures in readable form. Preserve complex schema constructs in the advanced raw-schema view rather than flattening them into incorrect claims. Render supplied output schemas and annotations when available. Read-only or destructive annotations are provider claims, not security guarantees.

Provider-supplied manuals or examples appear only when the integration actually exposes them. A description or input schema does not imply that examples or an output manual exist. Missing documentation is labeled as missing. MCP server instructions are external content: render them inertly as attributed reference text, without following instructions, running tools, embedding scripts, or automatically fetching linked pages. Do not add a new server-instructions model context contribution for this UI.

Use the supervisor's current discovered tool generation. After disconnect, show connection state and either omit unavailable live tools or retain them explicitly as stale; the builder selects one consistent policy and tests it. A status read must not refresh server discovery over the network merely because the page opened.

## Hooks

The catalog represents individual registered hook handlers, not only adapter packages. Each entry shows a safe display name, adapter/source, exact configured event, matcher where relevant, enabled/registration state, behavior and potential effects, and documentation completeness. If configuration provides no friendly name or description, use a deterministic event/ordinal label and explain that a handler-specific description is unavailable. Never derive a description by exposing its raw shell command.

A labeled **Hook type** dropdown above the flat list mirrors the Skills page's filter controls. Its values are All types, Session, Prompt, Tool, Turn completion, and Subagent. Default to All types. Type identifies lifecycle position, not provider or execution outcome. Show the type and event in each row. One logical hook that declares multiple events matches any applicable type and appears once; independently configured command handlers remain distinct even if their commands happen to match. Unsupported events are not presented as enabled registrations.

For the current Claude-compatible adapter, the supported events are SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStart, and SubagentStop. Other adapters display only their supported events. Preserve the actual DSH mapping: UserPromptSubmit runs at incoming-message admission, which is not necessarily identical to every upstream product's user-only prompt semantics. Stop is a stopping boundary, not a generic PostPrompt or proof that the turn has already finished. PostToolUse does not undo an executed operation. The manual describes only decisions that the specific adapter honors.

Separate **Trigger timing** from **Last recorded execution**. Trigger timing explains the workflow edge, exact event, and matcher. Execution details show invocation timestamp in the user's timezone, duration, and recorded decision/exit information only when reliably available. A loaded adapter, an enabled configuration, or a success exit code alone does not justify an invented healthy/passed status.

Existing hook invocation/result events are the only initial execution-history source. There is no new persistent event or historical rewrite in this scope. The current bridges mint per-invocation handler IDs, so the reader must not assign an old result to a configured handler based only on event, matcher, order, or command similarity. Show individual last-run information only when the source provides a reliable association. Otherwise show “Not available for this handler”; an optional clearly labeled event-level observation must never be presented as its individual run. Detached lifecycle events may have no durable pair. No record means unavailable, not never ran.

## Sources and implementation direction

The existing [panel adapter](../../../packages/client/ui-skill/src/client/panel-plugin.ts) combines command descriptors and plugin inventory. Reuse it as the UI integration point and split the current large detail JSX into focused internal components as needed. The existing [command descriptors](../../../packages/interaction/commands/src/types.ts) provide descriptions and hints but not full manuals; add optional owner-provided reference metadata without changing execution grammar or adding it to model tool schemas.

MCP runtime observations belong to the existing [connection supervisor](../../../packages/mcp/mcp-client/src/connection.ts). Hook registration observations belong to each hook adapter after its existing parse/registration process, not a second UI-side read of configuration files. Reuse an existing suitable read-only contribution service if repository investigation finds one; otherwise add a narrow owner-scoped reference contribution to the existing inventory path. Registrations are disposable effects and retain Host versus Agent scope. Avoid a generic plugin-configuration browser.

The stable product must not acquire a runtime dependency on experimental hook packages. Hook adapters can publish through a stable optional contribution interface; absent adapters yield an honest unavailable/empty state. Source-owner callbacks or typed descriptions expose only sanitized catalog fields. Wire responses contain JSON-compatible data and branded cross-boundary identities. Reuse the existing authenticated Remote and UI resource infrastructure; no separate HTTP server ships with this feature.

## Cost, privacy, and failure handling

Opening or searching the reference must not add model requests, system prompt text, tool schema text, or Session messages/events. The existing command/tool behavior can still consume tokens when invoked outside the reference. Manuals and current observations are Host/UI data, loaded on demand and cached through existing resources. No full Session scan is performed on each render. If bounded existing history access cannot reliably produce a hook record, display unavailable rather than introducing a new history service.

Exclude secrets and arbitrary configuration by construction: no environment maps, HTTP headers, credentials, URL query credentials, raw executable arguments, raw hook commands, stdout, stderr, or tool argument values. Safe catalog identifiers and approved authored examples are not a license to expose config blobs. Render untrusted content through existing safe text/Markdown primitives. Status errors use localized actionable messages rather than exposing raw provider diagnostics.

Loading, disconnected, documentation-missing, no-Session, empty-filter, and failed-read states remain distinguishable. One unavailable MCP server or hook adapter must not blank other catalog entries or the Commands tab. Stale cached status must be labeled. Page disposal, source disposal, Session changes, and reconnects invalidate relevant resources and prevent late publication.

## Acceptance criteria

1. A first-party command displays a complete handler-verified manual; an extension with only a hint shows that hint without fabricated syntax, subcommands, or examples. Copy never executes.
2. Command availability changes with Session/preset scope. Reading a cold Session reference does not activate an Agent, start a turn, or inject context.
3. An active MCP plugin with a disconnected server cannot appear connected. Server tool descriptions and schemas correspond to the current discovered generation and selected scope.
4. MCP documentation with complex schema or malicious Markdown remains inert and does not imply unsupported validation or trigger network/model requests.
5. Hooks render as actual handlers with a Skills-style type filter; type and search combine, All types resets the type filter, and empty results clear stale detail.
6. A hook detail explains its real event, matcher and effects. Enabled, recorded success, and unknown history are distinct. An ambiguous historical result is never assigned to an individual handler.
7. Secret-bearing test configurations cannot appear in list, detail, errors, copy values, or cached wire payloads.
8. Real shipped Loader/Web composition tests cover the reference and status transitions; external MCP traffic and model streams alone may be controlled fixtures. Include resource disposal and stale asynchronous selection tests, EN/ZH copy, keyboard access, narrow layout, and a keyless recorded-session scenario demonstrating unchanged model-visible history when browsing.
9. Run focused behavior tests, relevant GUI and Web replay checks, then build artifacts followed by aggregate build checks. Activation/restart remains a separate owner decision.

## Builder decisions

Reuse the existing panel instead of building another app, follow the authoritative DSH design system rather than the mockup's styling, use source-owned typed manuals, and prefer explicit missing information over synthetic documentation. Initial hook history is best-effort only when already correlatable; adding durable handler identity is deferred. The exact minimal inventory contribution interface, document storage format, supported JSON Schema presentation details, and file split belong to implementation planning after inspecting all current consumers. These choices must preserve the privacy, scoping, and no-session-cost requirements above.

The prototype is disposable and contains sample data. It is not a data source, a capability-status authority, or code to ship. No product implementation, commit of unrelated changes, or runtime restart is authorized by approving the prototype alone.
