# News to Knowledge Intake design

Status: approved by Denny, 2026-09-08. Revised the same day during planning, after reading the vault bridge showed it was not source agnostic; the bridge now gains a `kind` discriminator. Implementation plan: `docs/superpowers/plans/2026-09-08-news-knowledge-intake.md`.

## Why

Today the Knowledge lifecycle's only Intake source is a captured Live Signal conversation. `KnowledgeService.save` (`packages/host/knowledge/src/index.ts:58`) reads a Session log and hands it to `store.save` as raw evidence. The News panel (`packages/client/ui-news/src/client/NewsPanel.tsx`) fetches public RSS feeds and already writes each article as a raw intake note on disk (`packages/host/news/src/notes.ts`), but nothing lets the owner pull one of those articles into the Knowledge lifecycle for distillation, review, and eventual promotion into a real Vault note. This closes that gap with the smallest addition that reuses the existing Intake and distillation machinery unchanged in shape.

## Scope

One button per News item in `NewsPanel.tsx`. Clicking it captures that single article into Knowledge Intake, using the same store, distillation, review, and publication pipeline a captured conversation already goes through. No bulk action, no background sweep, no new package, no change to `KnowledgeRecord`'s shape.

## Current relevant state

`store.save(sessionId, title, content)` (`packages/host/knowledge/src/store.ts:76`) is a generic Intake writer on the TypeScript side: any string id, any title, any raw content string, filed as a `1 Intake` `KnowledgeRecord` through `DshKnowledge.ps1`. It does not parse or assume anything about the content's shape.

The vault side bridge it delegates to is not source agnostic, which this design's first draft got wrong. `DshKnowledge.ps1`'s `save` block (lines 268 to 313) hardcodes conversation labeling into every artifact it writes: evidence always lands at `Evidence/session.jsonl`, `topics` is always `@('dsh', 'conversation')`, the body reads "Saved conversation evidence", and the provenance statement reads "Owner saved a DSH conversation". Reusing it unchanged for a News article would write false provenance metadata into an artifact schema whose purpose is auditable provenance, so the bridge gains an optional `kind` discriminator instead. See the corresponding note under Design.

`KnowledgeService.save` (`index.ts:58`) is the only caller today, and it is conversation specific: it takes a `SessionId`, flushes and reads that live Session's log, and derives `content` itself before calling `store.save`. There is no existing entry point that accepts caller supplied text directly.

`runDistillation` (`index.ts:94`) reads `attempt.derivedFrom[0]`, loads the original `KnowledgeDocument`, and builds a prompt that embeds `original.evidence` as `sessionJsonl` inside a JSON blob, with fixed instruction text that calls the source a conversation and asks the model to cite session event `seq` values. The model runs with `tools.restrict({ allow: [] })` and a `tools.guard` that refuses any tool call (`index.ts:122`), and the instructions explicitly tell the model to treat the evidence as untrusted data, not instructions. This guard is already evidence agnostic and needs no change.

`NewsItem` (`packages/host/news/src/types.ts`) carries `title`, `url`, `source`, `publishedAt`, `summary`, `imageUrl`, but no stable id field; `url` is the de facto identity, and `feed.ts` already has a `sha256` hashing helper (`imageCacheKey`) used the same way to key cached thumbnails.

## Design

### New Remote method: `KnowledgeService.saveText`

Add `saveText(request: { sourceUrl: string; title: string; content: string })` to `KnowledgeService`, alongside the existing `save`. It generates a stable id by hashing `sourceUrl` the same way `imageCacheKey` hashes image URLs, then calls `store.save(id, title, content, 'news')`. A stable id is what makes repeat captures of the same article deduplicate, since the bridge matches an existing artifact on the source identity plus the content digest.

Title sanitization stays in the bridge rather than being repeated here. `DshKnowledge.ps1` already strips control and path characters and truncates to 60 characters (lines 285 to 286), and a second implementation in TypeScript would be two rules free to drift apart.

This is a new method rather than an overload of `save`, because `save`'s contract is specifically about deriving content from a live Session; blending the two would blur that guarantee for its existing caller.

### Bridge: an optional source kind

`DshKnowledge.ps1`'s `save` command gains an optional `kind` field, valid values `conversation` and `news`, defaulting to `conversation` when absent. The value selects four things that are hardcoded today: the evidence filename (`Evidence/session.jsonl` or `Evidence/article.txt`), the second topic tag (`conversation` or `news-article`), the artifact body's lead sentence, and the provenance `original_statement`. The artifact frontmatter gains a `source_evidence_path` field recording which filename was used, and the bridge's reader honors that field with a fallback to the old hardcoded path, so artifacts written before this change keep reading correctly.

Defaulting to the current behavior when the field is absent is what keeps this backward compatible in both directions: an older DSH client talking to a newer bridge is unchanged, and `KnowledgeStore.save` only sends the field when a caller supplies it, so the existing conversation request stays byte identical.

`KnowledgeStore.save` gains a matching optional fourth parameter, appended so its existing three argument call sites are untouched.

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

Any background or scheduled sweep of the News folder. Any change to the tool restriction or untrusted evidence guard in `runDistillation`. Any behavior change to how captured conversations are saved; the bridge's `kind` default exists precisely so that path stays identical. Bulk selection of multiple News items in one action.

## Testing

The bridge's own PowerShell self-check (`Agents/Tools/Test-DshKnowledge.ps1`) covers a News kind round trip: correct topics, evidence at `Evidence/article.txt`, lossless bytes, and a rejected unknown kind. Its existing conversation assertions stay untouched, which is what proves the default path is unchanged. A focused store test covers a News save against the real bridge and confirms a repeat save returns the same artifact id. A focused test on the reworded distillation prompt confirms it still refuses tool execution and still completes for a plain text evidence string that is not JSONL shaped. UI tests on `NewsPanel.tsx` cover a successful capture, a failed capture, and the absence of the button when no capture capability is composed.

## Review checklist

Is the new entry point evidence agnostic rather than News specific. Yes, `saveText` takes arbitrary title and content and knows nothing about feeds.

Does the untrusted evidence guard still apply to the new source. Yes, unchanged, since it never depended on content shape.

Is any interface duplicated rather than extended without cause. No, `saveText` is added because `save`'s contract is intentionally tied to a live Session; the two are different intents with the same underlying store call.

Is this reversible. Yes, one new method, one new UI button, a prompt wording change, and one additive optional bridge field; none of them change the shape of already persisted artifacts, and the bridge reader keeps a fallback for artifacts written before the change.

## Next step

Execute `docs/superpowers/plans/2026-09-08-news-knowledge-intake.md`.
