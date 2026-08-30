# @deepseek-ai/dsh-llm-codex-subscription

English | [中文](README.zh.md)

This package registers the `codex-subscription` provider route and uses the locally authenticated Codex CLI as a completion backend for the harness LLM service. Each request runs `codex exec` through the harness subprocess service, writes a plain-text transcript to stdin, and translates Codex JSONL events into `StreamChunk` values.

## Config

```yaml
- id: llm-codex-subscription
  name: '@deepseek-ai/dsh-llm-codex-subscription'
  config:
    executable: codex
    cwd: C:/work/project
    graceMs: 5000
```

`executable` defaults to the `codex` command resolved through the subprocess service. `cwd` defaults to the host process working directory. `graceMs` controls the interval between graceful termination and forced termination.

The CLI runs with user configuration ignored, a read-only sandbox, ephemeral JSONL output, and repository checks disabled. Subscription authentication remains owned by the installed Codex CLI; this package accepts no API key. Only completed `agent_message` items become text blocks, while CLI warnings and other item types are discarded.

Malformed JSONL, missing terminal events, subprocess transport failures, and empty successful responses become `LlmError` failures. A caller abort terminates the subprocess and reports `ABORTED`.

## Model Experience

### Codex request

#### What the model sees

Codex receives the harness system prompt followed by message history serialized with `[user]` and `[assistant]` role labels. Text nested in prior tool results is preserved; image, reasoning, and live tool-call blocks are omitted.

#### Token effect

The flattened transcript is tokenized by Codex. CLI initialization metadata is ignored by the harness but still contributes process overhead.

#### KV Cache effect

Each request starts a new CLI process. Repeated prompt prefixes may use provider-managed caching when Codex supports it, but this adapter maintains no local cache state.

### Codex response

#### What the model sees

The model receives no adapter-authored follow-up content after generation begins.

#### Token effect

Codex emits each completed agent message as one text block rather than token-level deltas. Only blocks retained by the agent loop enter later requests.

#### KV Cache effect

Retained response text appends to the next flattened transcript; omitted event metadata has no later cache effect.

## Known Limitations and Deferred Work

- The read-only sandbox prevents workspace writes but does not prevent the Codex agent from attempting tools or reading accessible files. A completion-only Codex transport is required before this route can guarantee that the CLI performs no agent actions.
- Message serialization is plain text rather than a lossless block protocol. Images, reasoning blocks, and live tool calls do not survive route changes.
- Codex emits completed messages rather than token-level deltas, and every completion starts a new CLI process.
