/** Wire-safe News feed vocabulary shared by the Host Remote and browser. */

/** One editorial item from a configured public feed. */
export interface NewsItem {
  readonly title: string
  readonly url: string
  readonly source: string
  readonly publishedAt: string | null
  readonly summary: string
  /** Same-origin image route, or null when the item has no cover image. */
  readonly imageUrl: string | null
}

/** Complete News response returned by the Host Remote. */
export interface NewsSnapshot {
  readonly fetchedAt: string | null
  readonly news: readonly NewsItem[]
  readonly tools: readonly NewsItem[]
}

/** News list request; refresh bypasses the six-hour cache. */
export interface NewsListRequest {
  readonly refresh?: boolean
}
