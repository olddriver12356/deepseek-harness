import { expect, it, vi } from 'vitest'
import { publicHttpNetwork } from '@deepseek-ai/dsh-web-fetch-http/src/network.ts'
import { fetchText } from '../src/feed.ts'

it('refuses local and cloud metadata URLs before any request', async () => {
  for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/']) {
    await expect(fetchText(url)).rejects.toThrow()
  }
})

it('checks redirect destinations instead of forwarding a public request into a private network', async () => {
  const resolve = vi.spyOn(publicHttpNetwork, 'resolve').mockImplementation(async (hostname) => {
    if (hostname !== 'public.example') throw new Error('non-public destination')
    return [{ address: '8.8.8.8', family: 4 }]
  })
  const close = vi.fn(async () => {})
  const request = vi.spyOn(publicHttpNetwork, 'request').mockResolvedValue({
    response: new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }) as never, close,
  })
  try {
    await expect(fetchText('https://public.example/')).rejects.toThrow()
    expect(request).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  } finally { resolve.mockRestore(); request.mockRestore() }
})
