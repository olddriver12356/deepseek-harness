# Agent Note: Chinese personal understanding and owner-reviewed tidy-up

Status: implemented

## Problem

The owner wanted every stored understanding in About Me to be Chinese, wanted similar claims merged into one atomic claim, and found the claim graph clipped when it held many nodes. The original Bok page has no merge operation, and agents read claims one by one through `bok_person_context`, so near-duplicates and English statements reach every consumer.

## Decision

New statements are Chinese at the point of entry. The Host rejects any `bok_observe_conversation` signal whose `candidate_statement` is not Simplified Chinese starting with `用户`, and the observer's extraction instructions request that form. This check lives in the DSH bridge so the pinned Bok engine stays unmodified.

Existing claims are tidied by an owner-started request rather than a background job. The optional `compaction` configuration enables a **整理理解** dialog that states how many claims and private claims will be sent and excludes sensitive claims. One request on the `agentDefaultModel` route returns JSON merges and translations. The Python bridge validates ids, repetition, group fields and the Chinese prefix, then stores the proposal. The owner checks individual cards. Application backs up first, refuses changed claims, and applies only the stored statements: a translation calls Bok's `correct`, and a merge calls `supersede` on the first claim, expires the rest with a reference to the replacement, and copies their source references. Every original stays in Bok history, so the owner can audit or restore it.

The tidy-up request belongs to no Session, so the model-visible input is logged in Personal Core instead: `.bok/dsh-compaction/<id>.request.json` holds the exact request before dispatch, and the proposal and result files sit beside it. This mirrors the observer, whose requests are logged as session events because they belong to a Session.

Each claim group sits just outside its own claim ring, so edges stay short. The graph is an unbounded canvas: dragging or wheel and trackpad scrolling pans it, the wheel is captured so the page does not scroll underneath, the drawing starts centred, and a drag never opens a claim, so large graphs remain reachable without shrinking labels or adding scrollbars.

## Constraints

The vendored browser script and stylesheet carry the graph change; the dialog lives in DSH-owned `dsh-compaction.js`. Merges never cross claim type, scope or sensitivity, so a merge cannot widen access or reclassify a claim. Correction and supersession mark the result as owner-confirmed; the per-card review supplies that confirmation. A proposal applies once, and stopping at the first failed item leaves earlier items applied and recorded with the backup id.

## Verification

The Loader composition test seeds claims through the real tool path, rejects a non-Chinese signal, and checks the summary counts, an unknown id, a mixed-group merge, a non-Chinese statement, a fenced valid proposal, the exact model route and stored request, an out-of-range selection, a merge that leaves the unchecked translation untouched, a second application, a stale proposal after a later correction, and the 404 after plugin disposal.

## Alternatives considered

A display-only grouping would leave agents reading duplicate claims. Calling Bok's admin `claims/propose` route from the browser would require widening the upstream route allowlist. Sending private claims without asking would conflict with their classification, so the dialog asks on every run.

## Consequences

Each tidy-up run costs one model request bounded by the configured limits. Merged claims carry combined source references up to Bok's limit of 50. The related integration decision is in the [Bok Personal Core note](2026-09-18-bok-personal-core.md).
