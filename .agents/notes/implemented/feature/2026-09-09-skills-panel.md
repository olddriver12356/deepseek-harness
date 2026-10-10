# Agent Note: Skills page and collage backgrounds

Status: implemented

## Problem

The local Skills page needs physical file management and drafting while preserving the model-facing skill catalog.

## Decision

The Skills page keeps its index, file tree, editor, collage artwork, category metadata, physical project/personal scope, invocation flags, slash-normalized name search, optional description search, and fresh-session drafting handoff. Host skillFiles operations enforce revisions and explicit file changes. Experts and Styles retain their separate presentation.

## Alternatives considered

Combining physical file management with model-facing skill resolution would conflate file identity and invocation rules. The two services remain separate.

## Consequences

The UI retains its local controls while callers follow the current upstream Session and Workspace APIs. Original implementation records remain in the owner Vault integration attachment; they are historical evidence rather than instructions to replay.
