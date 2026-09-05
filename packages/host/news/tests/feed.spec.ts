import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectFeed, parseFeed, type FeedSource } from '../src/feed.ts'

const SOURCE: FeedSource = { name: 'Test', url: 'https://example.com/feed.xml' }
const NOW = Date.parse('2026-09-04T12:00:00.000Z')

afterEach(() => { vi.restoreAllMocks() })

describe('News feed collection', () => {
  it('parses RSS and Atom links, strips markup, and filters older entries', () => {
    const xml = `
      <rss><channel>
        <item><title><![CDATA[Fresh &amp; useful]]></title><link>/fresh</link><pubDate>Fri, 04 Sep 2026 10:00:00 GMT</pubDate><description><![CDATA[<p>Hello <b>world</b></p>]]></description><enclosure type="image/jpeg" url="/fresh.jpg" /></item>
        <entry><title>Old</title><link href="https://example.com/old" /><updated>2026-08-30T12:00:00Z</updated></entry>
      </channel></rss>`

    expect(parseFeed(xml, SOURCE, NOW - 3 * 24 * 60 * 60 * 1000)).toEqual([{
      title: 'Fresh & useful',
      url: 'https://example.com/fresh',
      source: 'Test',
      publishedAt: '2026-09-04T10:00:00.000Z',
      summary: 'Hello world',
      sourceImageUrl: 'https://example.com/fresh.jpg',
    }])
  })

  it('deduplicates and limits the combined column to ten newest items', async () => {
    const items = Array.from({ length: 11 }, (_, index) => `
      <item><title>Item ${index}</title><link>https://example.com/${index}</link><pubDate>${new Date(NOW - index * 60_000).toUTCString()}</pubDate></item>`).join('')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`<rss><channel>${items}<item><title>Duplicate</title><link>https://example.com/0</link></item></channel></rss>`, { status: 200, headers: { 'content-type': 'application/rss+xml' } })))

    const result = await collectFeed([SOURCE, { ...SOURCE, name: 'Mirror' }], NOW)
    expect(result).toHaveLength(10)
    expect(result[0]?.title).toBe('Item 0')
    expect(new Set(result.map(item => item.url)).size).toBe(10)
  })
})
