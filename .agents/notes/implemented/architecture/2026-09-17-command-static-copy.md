# Agent Note: Static command contribution text

Status: implemented

English | [中文](2026-09-17-command-static-copy.zh.md)

## Problem

The installed subscriptions plugin registers `/fast` with a string description. The command menu invoked every description as a callback, throwing before returning any host command or client contribution. Independent trigger sources such as context and skills continued to appear, concealing the partial failure.

## Decision

CommandContribution accepts strings and callbacks for both label and description. Candidate generation evaluates callbacks on every request and passes static text through. The same shared path serves every contribution; host collisions and availability rules remain unchanged.

## Alternatives considered

Editing the installed subscription bundle would be overwritten by a package update and would leave other string-based contributions broken. Silently omitting the failed contribution would hide its command. Supporting both text representations preserves installed behavior without disabling the subscription provider.

## Consequences

Locale-aware first-party contributions keep callbacks. Static plugin copy remains unchanged until its owner registers it again. Other malformed callbacks still surface their errors; this compatibility change does not swallow arbitrary plugin failures.

## Testing

The regression reproduces the failure with static label and description beside host commands. Existing tests retain callback localization, dispatch and teardown coverage. The related service and browser-plugin suites pass 71 tests. Static strings cannot change locale until their owner registers updated text, so first-party localized contributions continue to use callbacks. This change does not repair unrelated provider RPC compatibility.
