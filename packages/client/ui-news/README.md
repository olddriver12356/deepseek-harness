# @deepseek-ai/dsh-client-ui-news

News application panel for the web surface. It registers a persistent `shell.overlay` occupant, follows `ctx.appPanels`, and reads the Host News Remote through the shared `api-remotes` assembly. The approved two-column editorial layout shows recent AI news plus tools and model releases, with loading, empty, error, refresh, and image fallback states.

## Model Experience

None, as the panel renders a browser surface and never assembles model input or sends model requests.

#### KV Cache effect

None; feed and thumbnail caches are owned by the Host News package and never enter a model request.

## Known Limitations and Deferred Work

- **Public feed variability**: publisher availability and markup can change independently of the harness; the Host keeps the last successful snapshot when a refresh fails.
- **Read-only links**: article cards open the publisher URL in a new tab; bookmarking and in-app article reading are not part of this migration.
