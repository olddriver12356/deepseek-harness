# @deepseek-ai/dsh-client-ui-knowledge

English | [中文](README.zh.md)

Read-only Knowledge application panel plugin. The browser half registers one persistent `KnowledgePanel` occupant in the shell-owned `shell.overlay` slot, reads `ctx.appPanels` as the only active-panel authority, and renders the approved Boujoy art direction with rounded DSH interaction surfaces. Selecting another application panel applies the native `hidden` state without unmounting the React subtree, so the search query, Layer filter, and selected artifact remain intact.

## Runtime contract

The plugin waits for the `shell.overlay` declaration through `ctx.slots.inject` and contributes the stable `knowledge-panel` list id. Its injected props contain only `ctx.appPanels` and `KNOWLEDGE_FIXTURE`. Search, Layer filtering, Layer-summary shortcuts, result counts, empty states, and artifact focus all derive locally from that immutable snapshot. `打开 ARTIFACT` is disabled and performs no navigation or callback.

## Data and asset boundaries

`KNOWLEDGE_FIXTURE` freezes its root, both arrays, every Layer, and every artifact. The package does not read a vault, call `ctx.fs`, use a Host Remote, access the network, or expose mutation. Real Agent Layer data remains deferred until a separately designed read-only capability can replace the fixture without changing presentation state.

The collage and Fusion Pixel font are package-owned tracked assets referenced by relative CSS URLs. The client bundle emits their original bytes under `lib/assets`, and the registered-package module host serves only their simple PNG and WOFF2 filenames under `/plugins/@deepseek-ai/dsh-client-ui-knowledge/assets/`. `LICENSE-OFL` and `LICENSE-BOUJOY` preserve their attribution in the published package.

## Model Experience

None, as the Knowledge panel reads a browser-local fixture and does not add content to a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Fixture only**: the five artifacts demonstrate the approved information architecture but do not reflect live Agent Layer contents.
- **Read-only action**: the artifact action remains disabled until reader behavior and file authorization are designed.
- **Independent panel styling**: no generic application-panel framework exists. Shared code may be extracted after another real panel proves a stable repeated contract.
