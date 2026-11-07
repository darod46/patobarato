import { unstable_cache } from 'next/cache'
import { searchAliExpress, type AliCredentials } from '../../../../lib/aliexpress'
import { RateLimiter } from '../../../../lib/rate-limit'

export const runtime = 'nodejs'

const limiter = new RateLimiter(30, 60_000)

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers })
}

export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2 || q.length > 80) return json({ error: 'invalid_query' }, 400)

  const appKey = process.env.ALIEXPRESS_APP_KEY
  const appSecret = process.env.ALIEXPRESS_APP_SECRET
  const trackingId = process.env.ALIEXPRESS_TRACKING_ID
  if (!appKey || !appSecret || !trackingId) return new Response(null, { status: 204 })
  const creds: AliCredentials = { appKey, appSecret, trackingId }

  const key = q.toLowerCase()
  if (!limiter.allow(key)) return json({ error: 'rate_limited' }, 429, { 'Retry-After': '30' })

  try {
    const cachedSearch = unstable_cache(
      async (k: string) => searchAliExpress(k, creds),
      ['ali-search'],
      { revalidate: 900 },
    )
    const products = await cachedSearch(key)
    return json({ products }, 200, {
      'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600',
    })
  } catch (error) {
    console.error('aliexpress search failed:', error instanceof Error ? error.name : 'error')
    return json({ error: 'upstream' }, 502)
  }
}
