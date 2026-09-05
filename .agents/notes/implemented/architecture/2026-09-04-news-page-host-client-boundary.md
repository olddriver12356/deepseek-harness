# Agent Note: News page Host and Client boundary

English | [中文](2026-09-04-news-page-host-client-boundary.zh.md)

Status: implemented

## Problem

The approved News page migration needed to run inside the DSH Web profile while keeping public feed retrieval, caching, image handling, and browser presentation in their owning planes.

## Decision

The Web profile now mounts `@deepseek-ai/dsh-host-news` as the `news` Host row with `cacheDir: dshHomePath('news-cache')`, mounts its generated `news/list` Remote through `@deepseek-ai/dsh-api-remotes`, and registers `@deepseek-ai/dsh-client-ui-news` in the additive `shell.overlay` slot. The Host owns six-hour feed caching, three-day and ten-item bounds, article-cover enrichment, and the exact-pair `/news/image` route with seven-day thumbnail caching and a 6 MB response limit. The Client owns the approved two-column panel, `appPanels` gating, loading, empty, error, refresh, and image fallback states. The client consumes only the Remote assembly and does not maintain a second authoritative feed cache.

## Alternatives considered

**Client-side feed fetching:** rejected because browser CORS, cache authority, and publisher image policy would move into the UI and make the surface deployment-dependent.

**A scheduled background feed job:** rejected because the feed is deployment-global while the existing schedule capability is agent-scoped; the six-hour cadence is sufficient when the Remote is read.

**Direct publisher image hotlinks:** rejected because the browser would bypass DSH's exact article/image relationship and size controls; cards use the same-origin `/news/image` route instead.

## Consequences

The Web bundle gains one Host cache directory and one browser overlay occupant, while the API Remote remains the single Client access path. Feed availability and publisher markup remain external limitations; a failed refresh returns the last valid cache when one exists. The parser uses the standard library rather than adding an XML dependency, so it intentionally supports the RSS and Atom fields required by the declared sources rather than arbitrary XML.

## Testing

Focused host tests cover RSS/Atom parsing, markup and entity cleanup, three-day filtering, deduplication, and the ten-item limit. Focused client tests cover active-panel loading, both columns, refresh, and error presentation. `verify-cordis-config` validates the 130 assembled config files, host and client aggregate `tsc` checks pass, both library faces build, and the Web profile dump contains the `news`, `api-remotes`, and `ui-news` rows.
