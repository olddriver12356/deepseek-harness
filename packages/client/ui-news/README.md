---
description: "Browse recent AI news, tools, and model releases in two columns."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-news

## Summary

Browse recent AI news, tools, and model releases in two columns. Refresh the feed, open publisher links, or capture a card into Knowledge Intake without a model call. Explicit distillation uses the Knowledge Host and leaves its output awaiting owner review; it never publishes a card automatically.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

## Behavior

News application panel for the web surface. It registers a persistent `shell.app-overlay` occupant, follows `ctx.appPanels`, and reads the Host News Remote through the shared `api-remotes` assembly. The approved two-column editorial layout shows recent AI news plus tools and model releases, with loading, empty, error, refresh, and image fallback states.

Each card offers model-free capture and explicit distillation when the Knowledge Remote is mounted. Distillation saves the feed-provided title, summary, and source into Intake, then calls the isolated Knowledge processor; it does not fetch the full article. Loading prevents repeat clicks and errors remain retryable. Successful output stays in Processed awaiting owner review. The button never reviews, marks learned, or publishes a card. Action labels follow the application locale.

## Model Experience

Indirectly, through explicitly requested distillation delegated to the Knowledge Host without assembling model requests itself.

#### KV Cache effect

None; feed and thumbnail caches are owned by the Host News package and never enter a model request.

## Known Limitations and Deferred Work

- **Public feed variability**: publisher availability and markup can change independently of the harness; the Host keeps the last successful snapshot when a refresh fails.
- **Read-only links**: article cards open the publisher URL in a new tab; bookmarking and in-app article reading are not part of this migration.

### Dev Note

None.
