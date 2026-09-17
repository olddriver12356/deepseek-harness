---
description: "Save conversations, explicitly distill and review Agent knowledge, and approve new Vault notes."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-knowledge

English | [中文](README.zh.md)

## Summary

The Knowledge Remote saves complete committed Session JSONL in Agent Intake without AI. Explicit distillation creates a separate derived artifact through the default model. Owner review accepts knowledge into Agent Layer 3; a separate content-bound approval publishes a new main Vault note. Identical Session evidence reuses its existing artifact.

## Table of Contents

- [Storage](#storage)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="storage"></a>
## Storage

The required `vaultRoot` points to a Vault containing `Agents/Tools/DshKnowledge.ps1`. Required `distillTimeoutMs` bounds an attempt and interrupted-run retry eligibility; required `maxInputBytes` rejects oversized framed evidence without truncation. The Web composition supplies 180000 ms and 524288 bytes. The bridge owns schema-compatible Markdown, source hashes, the Vault guard, shared writer lock, and derived-index rebuilds. Interrupted staging remains recoverable.

Knowledge cards use the minimal v2 bridge contract: Intake, Processed, and Knowledge, alongside separately authorized Methods. Review is a revision-bound accept/reject action without six gates or validation essays. Direct concept requests can enter Knowledge without claiming review. Only an owner-marked learned card can be published. Original evidence remains separate and is returned only by the explicit raw read. Ordinary reads use validated path hints to read current card bytes directly, falling back to the bridge after a move or for legacy metadata.

Promotion previews the full added content and a relative destination in an existing Knowledge domain or Resources collection. Explicit approval binds revision, destination, and output bytes. Publication creates a new file exclusively and never overwrites an existing note. An interrupted publication can leave a new destination requiring inspection; retry refuses that destination. Migration backs up legacy artifact Markdown and leaves evidence and Methods untouched.

## Model Experience

### Explicit distillation request

#### What the model sees

A one-shot request receives only cleaned source text, its identity, and existing candidate directory names. It bypasses Agent assembly, Memory, Vault instructions, MCP, skills, and tools. Tool-call output is rejected. A strict JSON response contains up to twelve concept cards with suggested allowed destinations. HTML cleanup is not a trust verdict: source and generated cards remain data. Saving, shelving, reviewing, learning, and publishing do not call a model.

#### Token effect

Processing consumes tokens through the current default provider and model. Framed input above `maxInputBytes` fails without truncation. No ordinary Agent session or tool loop is created; the source and resulting cards remain in the Vault.

#### KV Cache effect

The original conversation context is unchanged. Distillation has its own request history; reuse of its fixed instruction prefix depends on the provider.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Publication scope**: only new Markdown files are published; updating an existing note in place requires a separate merge workflow.
- **Review scope**: owner acceptance is not independent fact-checking and never authorizes embedded instructions.
- **Evidence scope**: attachment references survive, but attachment files and uncommitted stream chunks are not copied.
- **Local bridge**: requires PowerShell and the canonical Vault tool. One bridge response is limited to 64 MiB and oversized reads fail explicitly.
- **Lock recovery**: an existing writer lock blocks mutations; the service never guesses that a prior writer is dead.

### Dev Note

Path hints cache no content or approval state. Every read checks current bytes, and the guarded bridge rechecks revisions before writes.
