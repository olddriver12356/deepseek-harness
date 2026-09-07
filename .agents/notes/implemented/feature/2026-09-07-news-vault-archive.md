# Agent Note: News Vault archive

English | [中文](2026-09-07-news-vault-archive.zh.md)

Status: implemented

## Problem

The Host cache kept only the newest ten entries per News column, and it refreshed only when the Remote was read. Entries that were never displayed or checked disappeared as the three-day source window advanced, even though retaining the deterministic feed metadata is cheap.

## Decision

Each archive write also exports missing Markdown notes and updates a marked region of the Vault's `AI News.md` index without model calls. Existing article files remain untouched and legacy exports are recognized by URL/category frontmatter. Replaying retained records repairs missing exports even when no new feed items arrive. JSONL stays authoritative; note or index failures propagate and retry on a later archive operation. A per-path in-process queue serializes cache backfill and crawl writes; multiple Host processes must not share one archive.

The News Host now checks feeds on startup and every six hours through the Cordis timer. Each successful crawl keeps the existing newest-ten UI projection and appends every deduplicated entry observed within the source window to `<vaultRoot>/Resources/AI News/news.jsonl`. Each JSONL record stores schema version, column kind, fetch time, title, exact URL, source, publication time, and summary. Images are excluded. Deduplication uses the column kind and exact URL, so the operation requires no model turn and preserves the same URL if it appears in both columns.

The archive fails closed when an existing non-empty line is malformed. Remote refresh and the timer share one in-flight crawl, and a crawl failure still returns the last valid UI cache when available. An archive failure is not reported as a successful manual refresh.

## Alternatives considered

**JSONL-only storage:** insufficient for the user's Obsidian reading workflow. Per-item Markdown is a deterministic projection; URL/category hashes disambiguate sanitized filenames and exclusive creation preserves edits.

**A database or secondary URL index:** deferred because one sequential JSONL scan every six hours is the smaller system. Add an index only when measured archive size makes that scan material.

**The agent Schedule capability:** rejected because News collection is deployment-global and needs no model turn. The Cordis timer has the correct Host lifecycle.

## Consequences

Unviewed feed entries survive beyond the UI window in an append-only, portable Vault file with individual Obsidian reading notes. Collection runs only while the Host process is running, and the archive and note scans grow linearly with retained records. The files remain raw intake rather than curated knowledge.

## TDD evidence

Focused tests require the full source window to be archived while only ten items remain visible, preserve the same URL across distinct columns, reject malformed retained JSONL, avoid duplicates after restart, and prove startup collection without a Remote read.

## Related

- [News page Host and Client boundary](../architecture/2026-09-04-news-page-host-client-boundary.md)
