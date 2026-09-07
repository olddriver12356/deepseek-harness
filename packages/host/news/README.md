# @deepseek-ai/dsh-host-news

English | [中文](README.zh.md)

The Host News service fetches the public RSS sources used by the News panel, keeps a local six-hour cache, archives every deduplicated entry observed within the sources' three-day window, and publishes the newest ten entries per column through the generated `news/list` Remote. It also enriches visible entries without an RSS image from the article's declared cover image.

The image route is `/news/image`. It serves an image only when the exact image URL and article URL pair exists in the News cache. Downloaded images are cached for seven days and capped at 6 MB, so the route cannot be used as an open proxy.

`cacheDir` is the deployment-local feed and thumbnail cache. `vaultRoot` selects the Obsidian Vault, where the service appends records to `Resources/AI News/news.jsonl`. `refreshIntervalMs` defaults to six hours and cannot be lower than one minute. The Web bundle supplies `dshHomePath('news-cache')` and reads the Vault root from `DSH_VAULT_ROOT`, falling back to the launch directory.

The Host checks the feed on startup and then through the Cordis timer while the Host remains running. Archive records contain deterministic feed metadata only; no model turn is used. Records are deduplicated by feed column and exact article URL. A malformed existing JSONL archive fails closed instead of appending past possible corruption. A failed crawl returns the last valid UI cache when one exists, while an archive write failure remains a refresh failure.

## Model Experience

None. This package exposes a browser-facing News feed and does not assemble model input, tools, or provider requests.

#### KV Cache effect

None; the cache belongs to the browser News surface and never enters a model request.

## Known Limitations and Deferred Work

- **Public feeds only**: source availability, rate limits, and publisher markup can change independently of the harness.
- **Host-lifetime collection**: periodic fetches run only while the Host process is running; this is not an always-on external scheduler.
- **Linear archive scan**: each archive append scans the JSONL file to find existing URLs. Add an index only if measured archive size makes the six-hour scan material.
