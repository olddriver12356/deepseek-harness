# @deepseek-ai/dsh-llm-codex-subscription

[English](README.md) | 中文

本包注册 `codex-subscription` 提供方路由，并将已在本机认证的 Codex CLI（命令行界面）用作 harness LLM（大语言模型）服务的补全后端。每个请求都通过 harness 子进程服务运行 `codex exec`，将纯文本 transcript（文本记录）写入 stdin，并把 Codex JSONL 事件转换为 `StreamChunk` 值。

## 配置

```yaml
- id: llm-codex-subscription
  name: '@deepseek-ai/dsh-llm-codex-subscription'
  config:
    executable: codex
    cwd: C:/work/project
    graceMs: 5000
```

`executable` 默认为通过子进程服务解析的 `codex` 命令。`cwd` 默认为宿主进程的工作目录。`graceMs` 控制从正常终止到强制终止之间的等待时间。

CLI 在忽略用户配置、使用只读沙箱、启用临时 JSONL 输出并禁用仓库检查的情况下运行。订阅认证仍由已安装的 Codex CLI 负责，本包不接受 API key。只有已完成的 `agent_message` 项会转换为文本块，CLI 警告和其他类型的项会被丢弃。

格式错误的 JSONL、缺失的终止事件、子进程传输失败和成功但空白的响应都会转换为 `LlmError` 失败。调用方取消会终止子进程并报告 `ABORTED`。

## 模型体验

### Codex 请求

#### 模型看到什么

Codex 接收 harness 系统提示词，以及用 `[user]` 和 `[assistant]` 角色标签序列化的消息历史。先前工具结果中的嵌套文本会保留，图像、推理块和实时工具调用块会省略。

#### Token 影响

Codex 对展开后的 transcript 进行 token 化。harness 会忽略 CLI 初始化元数据，但这些元数据仍会增加进程开销。

#### KV Cache 影响

每个请求都会启动新的 CLI 进程。如果 Codex 支持，重复的提示词前缀可以使用提供方管理的缓存，但本适配器不维护本地缓存状态。

### Codex 响应

#### 模型看到什么

生成开始后，模型不会收到适配器编写的后续内容。

#### Token 影响

Codex 将每条已完成的 agent 消息作为一个文本块发出，而不是发出 token 级增量。只有 agent loop（智能体循环）保留的块会进入后续请求。

#### KV Cache 影响

保留的响应文本会追加到下一次展开的 transcript 中，省略的事件元数据不会影响后续缓存。

## 已知限制与延期工作

- 只读沙箱会阻止工作区写入，但不会阻止 Codex agent（智能体）尝试使用工具或读取可访问文件。在此路由能够保证 CLI 不执行 agent 操作之前，需要提供仅用于补全的 Codex 传输方式。
- 消息序列化使用纯文本，而不是无损的块协议。切换路由时，图像、推理块和实时工具调用不会保留。
- Codex 发出已完成的消息，而不是 token 级增量，并且每次补全都会启动新的 CLI 进程。
