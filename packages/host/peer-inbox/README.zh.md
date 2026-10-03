---
description: "为可信所有者中继与明确允许的在线根 Session 提供经过认证的回环请求入口。"
kind: "package-reference"
---

# @deepseek-ai/dsh-peer-inbox

[English](README.md) | 中文

## 概述

此可选 Host 插件使用单独的 `node:http` 监听器，仅绑定 `127.0.0.1`，接收所有者授权中继的输入。它不使用 Web 服务器，不公开浏览器 API，不创建或恢复 Session，不更改权限，也不提供远程审批。输入通过带 `peer-inbox` 插件来源的 `followup(createUserMessage(...))` 提交；插件不会 steer 或取消所有者工作。

## 使用此包

操作员必须明确安装并在 DSH profile 中挂载此包；发行版默认配置不会启用它。组合必须已有 `agents` 与驱动器。所有者先创建在线根 Session，再配置其精确 ID。离线或子 Session 会被拒绝；恢复的分支可以是在线运行时根。

```yaml
- name: '@deepseek-ai/dsh-peer-inbox'
  config:
    tokenEnv: DSH_PEER_INBOX_TOKEN
    port: 3921
    ledgerDir: /absolute/owner-private/dsh-peer-inbox
    allowedSessionIds: [owner-session-id]
    maxRequestBytes: 32768
    maxOutputBytes: 8192
    maxConcurrentRequests: 4
    maxPendingRequests: 4
    maxLedgerEntries: 1000
    requestTimeoutMs: 5000
    executionTimeoutMs: 1800000
```

所有字段都是必填部署策略。`maxOutputBytes` 限制含元数据的完整序列化结果，最低为 512。`maxRequestBytes` 计算 UTF-8 JSON 字节而非字符。`port: 0` 让操作系统分配测试端口；`ctx.peerInbox.port` 返回实际端口。通过指定环境变量提供至少 32 个可打印 ASCII 字节的密码学随机令牌，不要放进 YAML 或日志。环境和账本目录仅允许 Host/中继所有者访问。Windows 必须预先配置仅所有者可访问的 ACL；Node 文件模式不能保证 Windows ACL。POSIX 会检查目录/文件所有者与模式。插件不修改权限。

中继负责上游所有者认证，并在调用此端点前拒绝非所有者、机器人、重放和不可信输入。持有令牌即可访问所有配置 Session 的输入输出。同一所有者身份下的其他本地进程不属于此隔离模型。禁止代理、端口转发、隧道或公网暴露。插件不建立出站连接，也不返回重定向。

## 协议 v1

每个请求都需要 `Authorization: Bearer <secret>` 与精确的 `Host: 127.0.0.1:<port>`。拒绝浏览器 `Origin` 和 `Sec-Fetch-Site`。响应为 JSON，带 `Cache-Control: no-store`，不启用 CORS。

| 请求 | 响应 |
|---|---|
| `GET /v1/health` | `200 {protocolVersion:1,runtimeId}` |
| `POST /v1/requests`，精确字段 `{requestId,runtimeId,sessionId,text}` | 新请求 `202`；相同保留请求 `200` |
| `GET /v1/requests/:requestId` | `200`，返回保留的观察状态 |

POST 需要 `Content-Type: application/json`，不允许内容编码，文本不能为空。请求和 Session ID 使用 `[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}`。提交新请求前从认证 health 获取当前 `runtimeId`。结果包含 `requestId`、`status`（`queued`、`running`、`completed`、`failed`、`unknown`）、可选精确 `turn`，以及成功终态的 `text` 或失败/不确定状态的 `failureCode`。中继不得通过新 ID 自动重试执行状态不明的工作。

错误格式为 `{error: stableCode}`：输入无效 `400`，令牌错误 `401`，来源/Session 不允许 `403`，路由/请求不存在 `404`，请求冲突/旧运行时/非在线根 `409`，输入超限 `413`，并发/待处理超限 `429`，存储不可用/账本已满 `503`。HTTP 请求体不完整时可能返回 `408` 或断开连接。连接级准入可能在 HTTP 响应建立前关闭超量连接。

## 实现语义

分派前账本先持久化指纹与排队记录。相同 ID 配合不同运行时、Session 或文本返回 `request_conflict`；完全相同的请求即使重载后也只返回保留状态。账本从不自动淘汰 ID；容量耗尽时拒绝新请求。它不保存请求文本或密钥，但完成响应文本仍属于敏感数据。全文件发布沿用仓库 JSON 存储惯例：随机独占仅所有者临时文件、文件 fsync、原子 rename，以及 POSIX 目录 fsync。独占 `writer.lock` 防止多个写入者。崩溃留下锁；操作员确认没有写入进程后，只可移除陈旧锁，必须保留 `requests.json`。账本还保留精确输入消息 ID。插件启动与串行 Agent 创建时，保留终态记录只会移除同一 Session 中匹配自己 ID 与插件来源的待处理消息，并在队列释放前完成。下次打开时，排队/运行记录转为 `unknown` 与 `restart_execution_unknown`；插件不会再次提交。原始消息可能仍在 Session 的持久化收件箱中，所有者以后恢复 Session 时仍可能执行。unknown 不代表取消。禁止为重试不确定请求而删除账本。

`agent/inbox/claimed` 按精确消息 ID 关联 turn。仅同一 Session、同一 turn 的最终非工具 `assistant/message` 有资格输出，由 `turn/end` 确认终态。不会导出推理、工具、其他 turn 或流式中间片段。同一 turn 中任何额外 user-role 输入（包括插件/上下文输入）都会抑制输出并返回 `foreign_input`。这是 turn 范围的输出，不保证历史上下文不会影响结果。不使用全局 idle 时间段归因。

超时或卸载仅在可能时移除插件自己的待处理消息，返回 `timeout_withdrawn` 或 `plugin_disposed_withdrawn`。已认领工作继续运行，观察结果变为明确的执行未知；所有者可查看原 Session。丢弃消息和 Agent 销毁会结束观察，不会无限等待。持久化写入失败会禁用所有 HTTP 操作，直到操作员恢复存储并重载。

此包不发布 `./invariant`：它只有一个权威账本与私有观察状态，没有可独立变化的已发布派生注册表。HTTP、真实 Agent-loop 与 Loader 组合测试覆盖生命周期和安全行为。

## 验证

```sh
node node_modules/vitest/vitest.mjs run packages/host/peer-inbox/tests
node node_modules/typescript/bin/tsc -b packages/host/peer-inbox --pretty false
```

若 `DSH_RELAY_SOURCE` 指向规范的外部中继 `dsh-peer.mjs`，`tests/relay-integration.spec.ts` 会额外运行真实中继适配器；没有显式路径时跳过。测试仅使用假 LLM 与本地 HTTP，不调用 Slack 或真实模型。Loader 测试在包内固定模型可见输入与最终响应的预期转录。

## Model Experience

### 已接受的中继输入

#### What the model sees

接受的 `text` 作为来源为 `peer-inbox` 的 user-role 消息进入现有 Session；不新增提示词章节或工具。

#### Token effect

每次接受的文本增加 Session 历史的输入 token；入口由含 JSON 元数据的 `maxRequestBytes` 限制。

#### KV Cache effect

输入追加到现有历史，不改写旧消息。提供方缓存可用性与后续压缩不由本包控制。

## Known Limitations and Deferred Work

- 上游所有者认证属于可信中继；bearer 访问并非逐 Slack 用户授权。
- 容量限制覆盖整个账本生命周期，不自动清理。规划替换账本时必须保留请求记录。
- 崩溃或超时可能留下继续执行但输出未知的工作；不提供远程取消、审批或重放端点。
- Windows 仅所有者 ACL 是操作员前置条件，文件模式位不足以保证。
- MVP 尚无独立顶层录制 Session 传输适配器；无密钥 Loader 测试在包内固定组合转录。
