# Agent Note: Independent Knowledge panel and package-owned assets

Status: implemented

English | [中文](2026-09-02-knowledge-panel-ui.zh.md)

## Problem

The application rail identifies six product areas, but navigation alone does not define who owns each panel, how panel-local state survives selection changes, or how a visually distinct panel ships its static assets. Putting business panels inside the rail package would couple navigation to unrelated presentation and data decisions. Building a common panel framework before two real panels exist would turn one design into a premature abstraction.

The Knowledge design also depends on a collage and a display font. Fetching them from the Boujoy development server would make the shipped Web profile depend on a reference application, while embedding them as base64 would inflate the JavaScript bundle and erase a normal cacheable file boundary. A general package-file route would expose more of the installation than the browser needs.

## Decision

Implement Knowledge as `@deepseek-ai/dsh-client-ui-knowledge`, an independent browser plugin that contributes one persistent `shell.overlay` entry. The component should read `ctx.appPanels` for visibility, use the native `hidden` state when inactive, and keep search, Layer, and artifact selection as local React state. The package should use one frozen fixture and expose no vault, filesystem, Host Remote, network, or mutation capability.

Future business panels should use separate plugins with their own data and visual ownership. Shared panel code should be extracted only after another implemented panel demonstrates stable duplication. The application rail should remain a navigation plugin and should not become a panel container.

The client bundler should emit package-local PNG and WOFF2 references into `lib/assets` without changing their bytes. The module host should serve only simple supported filenames from the `lib/assets` directory adjacent to the registered package client bundle. Unknown packages, nested paths, traversal attempts, and unsupported extensions should remain unavailable.

## Alternatives considered

**Place Knowledge inside `ui-app-rail`.** Rejected because navigation would own business presentation, fixture data, local interaction state, and visual assets. Later panels would enlarge the same package and make independent replacement difficult.

**Create a generic application-panel framework first.** Rejected because Knowledge is the first real business panel. One implementation cannot establish a stable shared contract, and the existing slot plus `ctx.appPanels` already supplies the required lifecycle mechanism.

**Load assets from the Boujoy server.** Rejected because the reference repository is not part of the DSH runtime and must not become a production dependency.

**Inline assets as base64.** Rejected because multi-megabyte binary content would inflate `client.js`, increase parse and transfer cost, and prevent ordinary browser asset handling.

**Serve arbitrary files beside registered packages.** Rejected because the browser needs only emitted PNG and WOFF2 assets. A narrow route is easier to audit and does not create a general file-reading interface.

## Consequences

The shipped Web roster now loads Knowledge beside `ui-app-rail`. Selecting it reveals a persistent overlay without unmounting the Agent surface, and local search, Layer, and artifact selection state survives panel switches.

All visible Knowledge content comes from the frozen package fixture. The disabled artifact action and read-only copy make the current boundary explicit, while real Agent Layer data, navigation, and mutation remain deferred.

The production build emits the approved collage and font as package-owned files. The host serves only simple PNG and WOFF2 filenames for registered client packages, so the UI does not depend on a running Boujoy server and the route does not become a general file reader.

Independent panel packages may duplicate a small amount of layout or interaction CSS until another implemented panel proves a stable shared contract. That duplication is accepted for now and should be revisited only when extraction removes demonstrated repetition.
