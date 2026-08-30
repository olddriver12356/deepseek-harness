# @deepseek-ai/dsh-llm-claude-code-subscription

English | [中文](README.zh.md)

This package registers the `claude-code-subscription` provider route and uses the locally authenticated Claude Code CLI as a completion backend for the harness LLM service. Each request runs `claude -p` through the harness subprocess service, writes a plain-text transcript to stdin, and translates Claude Code's `stream-json` output into `StreamChunk` values.

## Config

```yaml
- id: llm-claude-code-subscription
  name: '@deepseek-ai/dsh-llm-claude-code-subscription'
  config:
    executable: claude
    cwd: C:/work/project
    graceMs: 5000
```

`executable` defaults to the `claude` command resolved through the subprocess service. `cwd` defaults to the host process working directory and is also passed through `--add-dir`. `graceMs` controls the interval between graceful termination and forced termination.

The CLI runs with user settings and hooks disabled through `--setting-sources ""`. The adapter denies a fixed list of built-in tools, requests partial streaming messages, and ignores non-content JSONL events. Subscription authentication remains owned by the installed Claude Code CLI; this package accepts no API key.

Malformed JSONL, missing terminal events, subprocess transport failures, and empty successful responses become `LlmError` failures. A caller abort terminates the subprocess and reports `ABORTED`.

## Model Experience

### Claude Code request

#### What the model sees

Claude receives the harness system prompt followed by message history serialized with `[user]` and `[assistant]` role labels. Text nested in prior tool results is preserved; image, reasoning, and live tool-call blocks are omitted.

#### Token effect

The flattened transcript is tokenized by Claude Code. CLI initialization metadata is ignored by the harness but still contributes process overhead.

#### KV Cache effect

Each request starts a new CLI process. Repeated prompt prefixes may use provider-managed caching when Claude Code supports it, but this adapter maintains no local cache state.

### Claude Code response

#### What the model sees

The model receives no adapter-authored follow-up content after generation begins.

#### Token effect

Text deltas and terminal usage are translated into harness chunks. Only blocks retained by the agent loop enter later requests.

#### KV Cache effect

Retained response text appends to the next flattened transcript; omitted event metadata has no later cache effect.

## Known Limitations and Deferred Work

- The tool denial list covers known built-in Claude Code tools but not machine-specific MCP tools or future built-ins. A bootstrap discovery call must replace the fixed list before this route can guarantee that no CLI tool is reachable.
- Message serialization is plain text rather than a lossless block protocol. Images, reasoning blocks, and live tool calls do not survive route changes.
- Every completion starts a new Claude Code process, so startup latency is paid per request.
