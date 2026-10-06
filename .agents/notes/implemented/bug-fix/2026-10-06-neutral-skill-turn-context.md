# Agent Note: Neutral Skill context in collaboration turns

Status: implemented

English | [中文](2026-10-06-neutral-skill-turn-context.zh.md)

## Problem

Ordinary human turns with Skill invocation, catalog or workspace-instruction context are classified as Peer discussion and lose action tools. The durable receipt projection repeats this error on restoration.

## Decision

The owning collaboration plugin treats only the explicit runtime context kinds `tool`, `plugin`, `skill-invocation`, `skill-catalog` and `agent-instructions` as neutral. Only `user` establishes human authority; Peer and unknown sources remain restrictive. Live classification and receipt restoration share `classifyMessages`. The derived projection version advances to rebuild cached classifications from unchanged Session events.

## Alternatives considered

**Treat every non-Peer source as trusted.** Unknown external sources would inherit human authority in mixed turns.

**Fix only live classification.** Restoration would retain the same defect through the independent projection fold and cached state.

## Consequences

Human-requested Skills preserve existing tool policies. Context alone cannot authorize actions, and mixed Peer input remains restrictive. No tool allowlist, control admission, Session format or stored source attribution changes. Additional context producers require explicit review before becoming neutral.
