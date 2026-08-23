# CodeGraph: LLM provider entry points

Generated from the local `hex-graph` MCP index for `C:\Projects\deepseek-harness`.

## Index

- Database: `.hex-skills/codegraph/index.db`
- Indexed project: `C:\Projects\deepseek-harness`
- Primary language coverage: JavaScript and TypeScript
- Cache policy: `.hex-skills/` is ignored because the graph is rebuildable machine-local state.

## Architecture query

The `packages/llm` scope contains these workspace modules:

- `@deepseek-ai/dsh-root`
- `@deepseek-ai/dsh-llm-retry`
- `llm-deepseek`
- `llm-pi-ai`
- `llm`
- `token-meter`

The MCP reported exact-confidence architecture data with verified JavaScript and TypeScript support.

## Provider entry points

For a provider that supports an existing protocol, use configuration instead of adding adapter code:

- User configuration: `%USERPROFILE%\.dsh\settings.yaml`, under `llm-pi-ai.providers`
- Configuration schema: `packages/llm/llm-pi-ai/src/config.ts`
- Provider registration and settings wiring: `packages/llm/llm-pi-ai/src/index.ts`
- Protocol mapping: `packages/llm/llm-pi-ai/src/provider.ts`
- Provider reference: `packages/llm/llm-pi-ai/README.md`
- User guide: `docs/user/guide/providers.md`

The built-in hand-declared protocol choices are `openai-completions`, `openai-responses`, and `anthropic-messages`.

Create a new adapter only when the provider cannot use one of those protocols or needs custom authentication, stream framing, or replay behavior:

- Adapter interface and registry: `packages/llm/llm/src/index.ts`
- Shared types: `packages/llm/llm/src/types.ts`
- Reference implementation: `packages/llm/llm-deepseek/`
- Cookbook: `docs/cookbook/adding-an-llm-adapter.md`

## Suggested graph queries

- Run `analyze_architecture` with `scope: "packages/llm"` after structural changes.
- Run `find_symbols` with a narrow file or package path before `inspect_symbol`.
- Run `find_references` or `trace_paths` on the exact adapter registration symbol before refactoring provider wiring.
