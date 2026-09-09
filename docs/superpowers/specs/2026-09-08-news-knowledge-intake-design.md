# News to Knowledge Intake design

Status: approved by Denny, 2026-09-08.

## Why

Today the Knowledge lifecycle's only Intake source is a captured Live Signal conversation. `KnowledgeService.save` (`packages/host/knowledge/src/index.ts:58`) reads a Session log and hands it to `store.save` as raw evidence. The News panel (`packages/client/ui-news/src/client/NewsPanel.tsx`) fetches public RSS feeds and already writes each article as a raw intake note on disk (`packages/host/news/src/notes.ts`), but nothing lets the owner pull one of those articles into the Knowledge lifecycle for distillation, review, and eventual promotion into a real Vault note. This closes that gap with the smallest addition that reuses the existing Intake and distillation machinery unchanged in shape.

## Scope

One button per News item in `NewsPanel.tsx`. Clicking it captures that single article into Knowledge Intake, using the same store, distillation, review, and publication pipeline a captured conversation already goes through. No bulk action, no background sweep, no new package, no change to `KnowledgeRecord`'s shape.

## Current relevant state

`store.save(sessionId, title, content)` (`packages/host/knowledge/src/store.ts:76`) is already a generic Intake writer: any string id, any title, any raw content string, filed as a `1 Intake` `KnowledgeRecord` through `DshKnowledge.ps1`. It does not parse or assume anything about the content's shape.

`KnowledgeService.save` (`index.ts:58`) is the only caller today, and it is conversation specific: it takes a `SessionId`, flushes and reads that live Session's log, and derives `content` itself before calling `store.save`. There is no existing entry point that accepts caller supplied text directly.

`runDistillation` (`index.ts:94`) reads `attempt.derivedFrom[0]`, loads the original `KnowledgeDocument`, and builds a prompt that embeds `original.evidence` as `sessionJsonl` inside a JSON blob, with fixed instruction text that calls the source a conversation and asks the model to cite session event `seq` values. The model runs with `tools.restrict({ allow: [] })` and a `tools.guard` that refuses any tool call (`index.ts:122`), and the instructions explicitly tell the model to treat the evidence as untrusted data, not instructions. This guard is already evidence agnostic and needs no change.

`NewsItem` (`packages/host/news/src/types.ts`) carries `title`, `url`, `source`, `publishedAt`, `summary`, `imageUrl`, but no stable id field; `url` is the de facto identity, and `feed.ts` already has a `sha256` hashing helper (`imageCacheKey`) used the same way to key cached thumbnails.

## Design

### New Remote method: `KnowledgeService.saveText`

Add `saveText(request: { title: string; content: string })` to `KnowledgeService`, alongside the existing `save`. It generates a stable id by hashing the caller supplied identity (for a News article, the article URL) the same way `imageCacheKey` hashes image URLs, sanitizes the title using the same control character and path character stripping `notes.ts` already applies to note filenames (`notes.ts:30`), then calls `store.save(id, sanitizedTitle, content)` unchanged.

This is a new method rather than an overload of `save`, because `save`'s contract is specifically about deriving content from a live Session; blending the two would blur that guarantee for its existing caller. `store.save` itself needs no change since it is already content agnostic.

### Content shape for a News article

`saveText`'s `content` argument for a News item is a plain text block built client side from fields already present in `NewsItem`: title, source, published date, url, and summary, in that order, one per line. This is deliberately not the same function that builds the on disk vault note in `notes.ts`, since that function also emits frontmatter and filename concerns that have nothing to do with model evidence; duplicating four lines of field formatting is cheaper than coupling two unrelated writers.

### UI: one button per item

`NewsPanel.tsx` renders a "Send to Knowledge" action on each article row, next to the existing title and summary. On click it builds the content block above and calls `saveText` with the article's title and that content. The panel needs a reference to the Knowledge Remote client to do this; the exact wiring point (how `ui-news` obtains the Knowledge client already used by `ui-knowledge`) is an implementation detail for the plan, not a design decision, since the Host already composes both Remotes into the same client session.

No loading state beyond what a normal Remote call needs; no confirmation dialog, since this only files an Intake record and executes no tools and changes no Vault content.

### Distillation prompt: generic wording, no schema change

`runDistillation`'s fixed instruction text is reworded to stop assuming the source is a conversation, since it must now serve both captured conversations and News articles without knowing which one it is. The JSON key `sessionJsonl` becomes `sourceEvidence`. The line asking the model to cite "source event seq values when available" is replaced with a source neutral instruction to cite direct quotes or section or article titles when available. The untrusted evidence and no tool execution instructions are unchanged, since they already make no assumption about content shape.

No new field is added to `KnowledgeRecord` or `KnowledgeDocument` to distinguish a conversation from a News article. The existing `evidence: string` already covers both, and the prompt no longer needs to know which one it is holding.

### Downstream pipeline

Review, shelve, preview, and promote are untouched. They already operate on `KnowledgeDocument` and `KnowledgeRecord` without caring how the Intake evidence was produced.

## Explicitly out of scope

Any background or scheduled sweep of the News folder. Any change to `store.ts`'s PowerShell bridge or its request schema. Any change to the tool restriction or untrusted evidence guard in `runDistillation`. Any change to how captured conversations are saved. Bulk selection of multiple News items in one action.

## Testing

A focused test for `saveText` mirroring `store.spec` coverage of `save`, confirming a generated id is stable for the same URL and that title sanitization strips the same character classes `notes.ts` already strips. A focused test on the reworded distillation prompt confirming it still refuses tool execution and still completes for a plain text evidence string that is not JSONL shaped. A UI test on `NewsPanel.tsx` confirming the new button calls `saveText` with the expected title and content shape.

## Review checklist

Is the new entry point evidence agnostic rather than News specific. Yes, `saveText` takes arbitrary title and content and knows nothing about feeds.

Does the untrusted evidence guard still apply to the new source. Yes, unchanged, since it never depended on content shape.

Is any interface duplicated rather than extended without cause. No, `saveText` is added because `save`'s contract is intentionally tied to a live Session; the two are different intents with the same underlying store call.

Is this reversible. Yes, one new method, one new UI button, and a two line prompt wording change; none of them touch persisted data shape.

## Next step

Hand this spec to the writing-plans skill to produce an ordered, file by file implementation plan.
