# Agent Note: Dedicated RPC registration from consumer contexts

Status: implemented

English | [中文](2026-09-18-dedicated-rpc-consumer-context.zh.md)

## Problem

Dedicated RPC registration used `owner.webServer` in the calling plugin's Context. A plugin injecting only `connection` could not access that undeclared service, even when a sibling Web server was running. The subscription plugin's registration failed with `cannot get property "webServer" without inject`; its POST requests then reached the static fallback and returned 405. Root-provided test doubles hid the dependency error.

## Decision

`HostConnectionService.register` resolves the available Web server through `owner.get('webServer')` and keeps route registration in the caller's effect. Consumers inject `connection` only. Missing Web transport fails explicitly before registration. The existing browser authentication and Host/Origin checks still run before dispatch.

## Alternatives considered

**Add `webServer` to the subscription plugin's injection list.** This makes a consumer depend on an implementation detail of the connection service and leaves every other consumer exposed to the same failure.

**Introduce a transport registry or deferred route mounting.** The reported deployment already has a running Web server. Adding another registry or changing registration timing is unnecessary for this fix.

## Consequences

Dedicated RPC consumers work from ordinary plugin contexts and their routes disappear on consumer disposal. Dedicated channels still require an available Web server at registration time; this change does not add a carrier-neutral implementation for them. The regression uses a sibling provider instead of a root-provided server, exercises an authenticated request, and checks route withdrawal. Existing request-trust tests retain authentication coverage.
