# @deepseek-ai/dsh-host-news

English | [中文](README.zh.md)

The Host News service fetches the public RSS sources used by the News panel, keeps a local six-hour cache, limits entries to the newest items from the last three days, and publishes the result through the generated `news/list` Remote. It also enriches entries without an RSS image from the article's declared cover image.

The image route is `/news/image`. It serves an image only when the exact image URL and article URL pair exists in the News cache. Downloaded images are cached for seven days and capped at 6 MB, so the route cannot be used as an open proxy.

The required `cacheDir` configuration is deployment-local; the Web bundle supplies `dshHomePath('news-cache')`.

## Model Experience

None. This package exposes a browser-facing News feed and does not assemble model input, tools, or provider requests.

#### KV Cache effect

None; the cache belongs to the browser News surface and never enters a model request.

## Known Limitations and Deferred Work

- **Public feeds only**: source availability, rate limits, and publisher markup can change independently of the harness.
- **On-demand refresh**: the six-hour cadence is enforced when the Remote is read; no background agent schedule is created for this global host feed.
