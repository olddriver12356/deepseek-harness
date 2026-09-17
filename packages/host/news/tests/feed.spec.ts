import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectFeed, parseFeed, type FeedSource } from '../src/feed.ts'
import { fetchPublic } from '../src/public-fetch.ts'
vi.mock('../src/public-fetch.ts', () => ({ fetchPublic: vi.fn() }))

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
    vi.mocked(fetchPublic).mockImplementation(async () => ({ response: new Response(`<rss><channel>${items}<item><title>Duplicate</title><link>https://example.com/0</link></item></channel></rss>`, { status: 200, headers: { 'content-type': 'application/rss+xml' } }) as never, close: async () => {} }))

    const result = await collectFeed([SOURCE, { ...SOURCE, name: 'Mirror' }], NOW)
    expect({ archived: result.archive.length, visible: result.visible.length }).toEqual({ archived: 11, visible: 10 })
    expect(result.visible[0]?.title).toBe('Item 0')
    expect(new Set(result.archive.map(item => item.url)).size).toBe(11)
  })
})
