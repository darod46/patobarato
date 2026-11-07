import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('../../../../lib/aliexpress', () => ({
  searchAliExpress: vi.fn(),
}))

import { searchAliExpress } from '../../../../lib/aliexpress'

const mockSearch = vi.mocked(searchAliExpress)
const product = {
  origin: 'aliexpress' as const,
  store: 'aliexpress',
  externalId: '1',
  title: 't',
  price: 5,
  originalPrice: null,
  discountPct: null,
  currency: 'EUR',
  imageUrl: null,
  affiliateUrl: 'https://ali/1',
}

async function load() {
  vi.resetModules()
  return (await import('./route')).GET
}
const call = (GET: (r: Request) => Promise<Response>, q?: string) =>
  GET(
    new Request(
      `http://localhost/api/buscar/aliexpress${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`,
    ),
  )

describe('GET /api/buscar/aliexpress', () => {
  beforeEach(() => {
    process.env.ALIEXPRESS_APP_KEY = 'k'
    process.env.ALIEXPRESS_APP_SECRET = 's'
    process.env.ALIEXPRESS_TRACKING_ID = 't'
    mockSearch.mockReset()
    mockSearch.mockResolvedValue([product])
  })
  afterEach(() => {
    delete process.env.ALIEXPRESS_APP_KEY
    delete process.env.ALIEXPRESS_APP_SECRET
    delete process.env.ALIEXPRESS_TRACKING_ID
    vi.restoreAllMocks()
  })

  it.each([undefined, '', '   ', 'a', 'x'.repeat(81)])('400 for invalid q %j', async (q) => {
    const GET = await load()
    const res = await call(GET, q)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_query' })
  })

  it('accepts 2 and 80 characters', async () => {
    const GET = await load()
    expect((await call(GET, 'ab')).status).toBe(200)
    expect((await call(GET, 'x'.repeat(80))).status).toBe(200)
  })

  it.each(['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID'])(
    '204 when %s is missing',
    async (name) => {
      delete process.env[name]
      const GET = await load()
      const res = await call(GET, 'freidora')
      expect(res.status).toBe(204)
      expect(mockSearch).not.toHaveBeenCalled()
    },
  )

  it('200 with products, cache header and normalised key', async () => {
    const GET = await load()
    const res = await call(GET, '  Freidora Aire ')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=900, stale-while-revalidate=3600',
    )
    expect(await res.json()).toEqual({ products: [product] })
    expect(mockSearch).toHaveBeenCalledWith('freidora aire', {
      appKey: 'k',
      appSecret: 's',
      trackingId: 't',
    })
  })

  it('429 with Retry-After on the 31st distinct query, repeats stay free', async () => {
    const GET = await load()
    for (let i = 0; i < 30; i++) expect((await call(GET, `query ${i}`)).status).toBe(200)
    const res = await call(GET, 'query 30')
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect((await call(GET, 'QUERY 0')).status).toBe(200)
  })

  it('502 on upstream failure and never logs the query', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockSearch.mockRejectedValue(new Error('bad keywords secret-query'))
    const GET = await load()
    const res = await call(GET, 'secret-query')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream' })
    expect(err).toHaveBeenCalledWith('aliexpress search failed:', 'Error')
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret-query')
  })
})
