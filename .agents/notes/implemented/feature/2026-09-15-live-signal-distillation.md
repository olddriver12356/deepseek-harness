# Agent Note: Live Signal collapse and distillation drafts

Status: implemented

## Problem

Live Signal needs a collapse control, and session distillation needs a separate review draft without changing the source session.

## Decision

The icon-only collapse control releases reserved width and resets on page reload. Capture creates a new session in the source registered Workspace, retains it until ready, and seeds an unsent draft referencing the source session and evidence cutoff before navigation.

## Alternatives considered

Submitting the draft automatically would bypass the requested content review. Writing Knowledge during capture would also conflate draft preparation with approval.

## Consequences

The draft asks for event citations and owner approval before artifact writes. This instruction is not server-side authorization. Existing Knowledge APIs remain available; capture itself performs no model submission or Knowledge write.
