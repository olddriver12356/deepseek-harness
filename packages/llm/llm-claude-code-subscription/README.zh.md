# @deepseek-ai/dsh-llm-claude-code-subscription

[English](README.md) | 中文

本包注册 `claude-code-subscription` 提供方路由，并将已在本机认证的 Claude Code CLI（命令行界面）用作 harness LLM（大语言模型）服务的补全后端。每个请求都通过 harness 子进程服务运行 `claude -p`，将纯文本 transcript（文本记录）写入 stdin，并把 Claude Code 的 `stream-json` 输出转换为 `StreamChunk` 值。

## 配置

```yaml
- id: llm-claude-code-subscription
  name: '@deepseek-ai/dsh-llm-claude-code-subscription'
  config:
    executable: claude
    cwd: C:/work/project
    graceMs: 5000
```

`executable` 默认为通过子进程服务解析的 `claude` 命令。`cwd` 默认为宿主进程的工作目录，并通过 `--add-dir` 传入。`graceMs` 控制从正常终止到强制终止之间的等待时间。

CLI 通过 `--setting-sources ""` 禁用用户设置和钩子。适配器拒绝一组固定的内置工具，请求部分流式消息，并忽略不含内容的 JSONL 事件。订阅认证仍由已安装的 Claude Code CLI 负责，本包不接受 API key。

格式错误的 JSONL、缺失的终止事件、子进程传输失败和成功但空白的响应都会转换为 `LlmError` 失败。调用方取消会终止子进程并报告 `ABORTED`。

## 模型体验

### Claude Code 请求

#### 模型看到什么

Claude 接收 harness 系统提示词，以及用 `[user]` 和 `[assistant]` 角色标签序列化的消息历史。先前工具结果中的嵌套文本会保留，图像、推理块和实时工具调用块会省略。

#### Token 影响

Claude Code 对展开后的 transcript 进行 token 化。harness 会忽略 CLI 初始化元数据，但这些元数据仍会增加进程开销。

#### KV Cache 影响

每个请求都会启动新的 CLI 进程。如果 Claude Code 支持，重复的提示词前缀可以使用提供方管理的缓存，但本适配器不维护本地缓存状态。

### Claude Code 响应

#### 模型看到什么

生成开始后，模型不会收到适配器编写的后续内容。

#### Token 影响

文本增量和终止时的 token 用量会转换为 harness 分片。只有 agent loop（智能体循环）保留的块会进入后续请求。

#### KV Cache 影响

保留的响应文本会追加到下一次展开的 transcript 中，省略的事件元数据不会影响后续缓存。

## 已知限制与延期工作

- 工具拒绝列表覆盖已知的 Claude Code 内置工具，但不覆盖机器特定的 MCP 工具或未来新增的内置工具。在此路由能够保证 CLI 无法访问任何工具之前，必须用启动时的发现调用替换固定列表。
- 消息序列化使用纯文本，而不是无损的块协议。切换路由时，图像、推理块和实时工具调用不会保留。
- 每次补全都会启动新的 Claude Code 进程，因此每个请求都要承担启动延迟。
