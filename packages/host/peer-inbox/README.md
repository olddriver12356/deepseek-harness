---
description: "Authenticated loopback request ingress for trusted owner relays and explicitly allowed live root Sessions."
kind: "package-reference"
---

# @deepseek-ai/dsh-peer-inbox

English | [中文](README.zh.md)

## Summary

This opt-in Host plugin accepts owner-authorized relay input through a separate `node:http` listener bound only to `127.0.0.1`. It does not use the Web server, expose browser APIs, create or resume Sessions, change permissions, or provide remote approval. It calls `followup(createUserMessage(...))` with plugin source `peer-inbox`; it never steers or cancels owner work.

## Use this package

An operator must explicitly install and mount this package in a DSH profile. No shipped profile enables it. The profile must already provide `agents` and a driver. Configure the exact Session IDs after the owner creates those live root Sessions. A configured but absent or child Session is rejected; a resumed fork may be a live runtime root.

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

All fields are required deployment policy. `maxOutputBytes` bounds the complete serialized result including metadata and must be at least 512. `maxRequestBytes` counts UTF-8 JSON bytes, not characters. `port: 0` requests a test-local ephemeral port; `ctx.peerInbox.port` reports the effective port. Supply a cryptographically random bearer secret of at least 32 printable ASCII bytes through the named environment variable, never through YAML or logs. Restrict the environment and ledger directory to the host/relay owner. On Windows, provision an owner-only ACL before use; Node mode bits do not enforce Windows ACLs. POSIX directory/file ownership and mode are checked. The plugin does not mutate permissions.

The relay is a trusted owner-input adapter: authenticate its own upstream sender and reject non-owner, bot, replayed and untrusted inputs before calling this endpoint. Possession of the bearer secret grants input and output access to every configured Session. Other local processes running as the owner are outside this isolation model. Do not proxy, forward, tunnel or expose the listener. The plugin opens no outbound connection and never redirects clients.

## Protocol v1

Every request needs `Authorization: Bearer <secret>` and the exact `Host: 127.0.0.1:<port>`. Browser `Origin` and `Sec-Fetch-Site` headers are rejected. Responses use JSON and `Cache-Control: no-store`; CORS is not enabled.

| Request | Response |
|---|---|
| `GET /v1/health` | `200 {protocolVersion:1,runtimeId}` |
| `POST /v1/requests` with exact `{requestId,runtimeId,sessionId,text}` | `202` for a new admission, `200` for an identical retained request |
| `GET /v1/requests/:requestId` | `200` with the retained observation |

POST requires `Content-Type: application/json`, no content encoding, and nonempty text. Request and Session IDs use `[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}`. Obtain the current `runtimeId` from authenticated health before new admissions. A result contains `requestId`, `status` (`queued`, `running`, `completed`, `failed`, `unknown`), optional exact `turn`, and either terminal `text` on completion or `failureCode` on failure/uncertainty. The relay must not automatically retry ambiguous work using a fresh ID.

Errors are `{error: stableCode}`: malformed input `400`, bad credentials `401`, disallowed origin/Session `403`, missing route/request `404`, request conflict/stale runtime/non-live-root `409`, input byte limit `413`, concurrency/pending limit `429`, and unavailable storage/full ledger `503`. An incomplete HTTP body times out with `408` or connection termination. Connection admission may close excess sockets before an HTTP response exists.

## Understand the implementation

The request ledger durably commits a fingerprint and queued tombstone before dispatch. Duplicate IDs with changed runtime, Session or text receive `request_conflict`; exact duplicates return their retained observation even after reload. The ledger never evicts IDs: capacity exhaustion fails closed. It stores no request text or secret, but completed response text is sensitive. Whole-file publication follows the repository JSON-storage convention: exclusive random owner-only temporary file, file fsync, atomic rename, and POSIX directory fsync. One exclusive `writer.lock` prevents simultaneous writers. A crash leaves that lock; after verifying no writer remains, an operator may remove only the stale lock, preserving `requests.json`. The ledger also retains the exact input message ID. At plugin startup and serial Agent creation, matching retained terminal requests remove only their own still-pending plugin messages from that same Session before queued work is released. On the next open, queued/running entries become `unknown` with `restart_execution_unknown`; the plugin never resubmits them. The original message may remain in the Session's durable inbox and execute if its owner later resumes that Session. Unknown is not cancellation. Never delete the ledger to retry an uncertain request.

A live `agent/inbox/claimed` event matches the exact message ID to a turn. Only a final non-tool `assistant/message` from that Session and turn is eligible, and `turn/end` settles it. Reasoning, tools, other turns and intermediate streaming chunks are not exported. Any additional user-role input in the same turn, including plugin/context input, suppresses output as `foreign_input`. This is turn-scoped output, not a claim that historical Session context cannot influence it. No global idle interval is used for attribution.

Timeout or unload removes only this plugin's pending message if possible (`timeout_withdrawn` or `plugin_disposed_withdrawn`). Already claimed work remains running and settles as explicit unknown execution; the owner may inspect its Session. Discarded messages and disposed Agents settle without waiting forever. Durable write failures disable all HTTP operations until an operator restores storage and reloads.

No `./invariant` companion is published: the package owns one authoritative ledger and private observation state, with no independently published derived registry to compare. Lifecycle and security behavior are verified through HTTP, real Agent-loop tests and Loader composition.

## Verification

```sh
node node_modules/vitest/vitest.mjs run packages/host/peer-inbox/tests
node node_modules/typescript/bin/tsc -b packages/host/peer-inbox --pretty false
```

`tests/relay-integration.spec.ts` additionally runs the real external relay adapter when `DSH_RELAY_SOURCE` points to its canonical `dsh-peer.mjs`; without that explicit path the test skips. It uses only a fake LLM and local HTTP, never Slack or a live model. The Loader test records the model-visible input and terminal response as a package-local expected transcript.

## Model Experience

### Admitted relay input

#### What the model sees

The accepted `text` is a user-role message with plugin source `peer-inbox` in the existing Session; no new prompt section or tool is added.

#### Token effect

Each admitted text adds input tokens to its Session history, bounded at ingress by `maxRequestBytes` including JSON metadata.

#### KV Cache effect

Input appends to existing history without rewriting prior messages. Provider cache availability and any downstream compaction remain outside this package.

## Known Limitations and Deferred Work

- The trusted relay owns upstream owner authentication; bearer access is not per-Slack-user authorization.
- Capacity is lifetime-bounded with no automatic pruning. Operators must retain tombstones when planning ledger replacement.
- A crash or timeout can leave work executing with unknown output; there is no remote cancel, approval or replay endpoint.
- Windows owner-private ACL provisioning is an operator prerequisite; file mode bits are insufficient.
- The MVP does not provide a dedicated top-level recorded-session transport adapter; its keyless Loader test pins the assembled transcript locally.
