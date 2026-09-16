# Agent Note: Restrained panel entrances

Status: implemented

English | [中文](2026-09-09-restrained-panel-entrances.zh.md)

## Problem

Application navigation benefits from a brief visual indication that the selected content has changed. Replaying that indication during feed refreshes, telemetry updates, or typing distracts from reading. Motion also needs to respect reduced-motion preferences and native dialog behavior.

## Decision

The static [ui-primitives library](../../../../packages/client/ui-primitives/README.md#entrance-motion) owns Anime.js lifecycle through `useEntranceMotion`. Consumers attach local refs and provide activation plus a scalar selection revision. Panel and dialog entrances are short; visible card batches are bounded and change opacity only, so existing hover transforms retain ownership.

The rail animates the selected number rather than the interactive tab. Knowledge replays cards on an explicit layer choice, while Experts and Styles reveal their first loaded cards once per activation. Skills and Monitor enter on activation. News waits for its first successful visible feed load each activation; a request that finishes while hidden waits for reactivation. Refreshes, query edits, and live values do not trigger another entrance.

Native dialog consumers activate motion after `showModal()` and clear their local dialog state in `onClose`, after native closing restores focus. Clearing that state during `onCancel` unmounts the dialog before the browser can restore focus to its trigger. Animation cleanup restores inline styles on completion, interruption, or a reduced-motion preference change. Closing remains immediate.

## Alternatives considered

**A separate animation plugin:** A presentation utility does not need Cordis registration, additional services, or a new application state owner. The shared static library gives consumers one lifecycle implementation.

**Continuous or data-driven motion:** Count-up telemetry, chart sweeps, streaming-text delays, and refresh-driven card entrances consume attention while information is being read. Explicit activation and selection changes give motion a limited purpose.

**Delayed exit animations:** Waiting for an exit to finish complicates Escape, focus restoration, and rapid navigation. Immediate closing keeps those interactions independent of animation settlement.

## Consequences

Consumers own asynchronous readiness and must keep revision values stable across ordinary data updates. Card selection occurs at entrance time; scrolling later does not animate more cards. Anime.js adds a browser dependency, while the hook introduces no model requests, durable data, or business subscriptions.

## Testing

The focused [helper suite](../../../../packages/client/ui-primitives/tests/entrance-motion.client.spec.tsx) passes five tests for activation, revision changes, cleanup, reduced motion, and bounded visible cards. The News and Monitor suites pass all 28 tests, including delayed feed readiness, hidden completion, refresh suppression, and immediate live projection updates.

The five other consumer packages run 91 tests: 89 pass, including all five added motion regressions; two existing Knowledge CSS assertions fail against the checkout's typography and background image. The three dialog suites pass all 16 tests after the native close handling change. Native-dialog tests verify `showModal()` precedes animation and closing permits immediate reopening.

Chromium verification confirms input focus on opening, trigger focus restoration after Escape, and reopening. Six panels write and restore animation styles; reduced motion produces zero animation style writes. Rapid tab changes leave no hidden content or browser errors.
