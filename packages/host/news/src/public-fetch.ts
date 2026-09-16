import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http'

/** Anonymous, DNS-pinned public fetch. Every redirect is independently checked. */
export async function fetchPublic(url: string, signal: AbortSignal, accept: string) {
  let target = new URL(url)
  for (let hop = 0; hop <= 5; hop++) {
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
      throw new Error('news: only anonymous HTTP(S) URLs are allowed')
    }
    const addresses = await publicHttpNetwork.resolve(target.hostname, signal)
    const result = await publicHttpNetwork.request(target, addresses, { accept, 'user-agent': 'DeepSeekHarness/0.1' }, signal)
    if (![301, 302, 303, 307, 308].includes(result.response.status)) return result
    try {
      const location = result.response.headers.get('location')
      if (!location) throw new Error('news: redirect has no destination')
      const next = new URL(location, target)
      if (target.protocol === 'https:' && next.protocol !== 'https:') throw new Error('news: insecure redirect')
      target = next
    } finally {
      await result.response.body?.cancel()
      await result.close()
    }
  }
  throw new Error('news: too many redirects')
}
