import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  fetchAllDealRefs,
  fetchDealByProduct,
  fetchDeals,
  fetchHashtagCount,
  fetchHashtagCounts,
  fetchHashtags,
  fetchLatestDeal,
  fetchRelatedDeals,
  parseDealSort,
} from './deals'

type Result = { data: unknown; error: { message: string } | null }

function fakeClient(result: Result) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'order', 'range', 'ilike', 'contains', 'limit', 'eq', 'neq']) {
    builder[name] = vi.fn((...args: unknown[]) => {
      calls.push([name, args])
      return builder
    })
  }
  builder.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  const from = vi.fn((table: string) => {
    calls.push(['from', [table]])
    return builder
  })
  return { client: { from } as unknown as SupabaseClient, calls }
}

const row = (i: number) => ({
  publication_id: i,
  published_at: '2026-11-04T10:00:00Z',
  price: '29.99',
  previous_price: '49.99',
  coupon: null,
  hashtags: ['lego'],
  affiliate_url: 'https://amzn.to/x',
  title: `Item ${i}`,
  image_url: null,
  asin: 'B000000000',
  country: 'ES',
  store: 'amazon',
  product_id: i,
  discount_pct: 40,
  previous_min_price: '34.99',
  is_lowest: true,
})

describe('fetchDeals', () => {
  it('queries the first page with ordering and range, and detects more pages', async () => {
    const { client, calls } = fakeClient({ data: Array.from({ length: 25 }, (_, i) => row(i)), error: null })
    const { deals, hasMore } = await fetchDeals(client, { page: 0 })
    expect(calls).toEqual([
      ['from', ['web_deals']],
      ['select', ['*']],
      ['order', ['published_at', { ascending: false }]],
      ['order', ['publication_id', { ascending: false }]],
      ['range', [0, 24]],
    ])
    expect(hasMore).toBe(true)
    expect(deals).toHaveLength(24)
    expect(deals[0]).toEqual({
      publicationId: 0,
      publishedAt: '2026-11-04T10:00:00Z',
      price: 29.99,
      previousPrice: 49.99,
      coupon: null,
      hashtags: ['lego'],
      affiliateUrl: 'https://amzn.to/x',
      title: 'Item 0',
      imageUrl: null,
      asin: 'B000000000',
      country: 'ES',
      store: 'amazon',
      productId: 0,
      discountPct: 40,
      previousMinPrice: 34.99,
      isLowest: true,
    })
  })

  it('uses the page offset and reports no more pages', async () => {
    const { client, calls } = fakeClient({ data: [row(1)], error: null })
    const { hasMore } = await fetchDeals(client, { page: 2 })
    expect(calls).toContainEqual(['range', [48, 72]])
    expect(hasMore).toBe(false)
  })

  it('escapes and trims the search text', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchDeals(client, { q: '  usb-c (2m) 50%  ', page: 0 })
    expect(calls).toContainEqual(['ilike', ['title', '%usb-c (2m) 50\\%%']])
  })

  it('filters by tag', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchDeals(client, { tag: 'lego', page: 0 })
    expect(calls).toContainEqual(['contains', ['hashtags', ['lego']]])
  })

  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchDeals(client, { page: 0 })).rejects.toThrow('boom')
  })

  it('maps the v3 columns and defaults them when absent', async () => {
    const { client } = fakeClient({
      data: [{ ...row(1), discount_pct: null, previous_min_price: null, is_lowest: null }],
      error: null,
    })
    const { deals } = await fetchDeals(client, { page: 0 })
    expect(deals[0]).toMatchObject({ discountPct: null, previousMinPrice: null, isLowest: false })
  })

  it('orders by discount for sort=descuento', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchDeals(client, { page: 0, sort: 'descuento' })
    expect(calls).toContainEqual(['order', ['discount_pct', { ascending: false, nullsFirst: false }]])
    expect(calls).toContainEqual(['order', ['published_at', { ascending: false }]])
  })

  it('filters is_lowest for sort=minimo', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchDeals(client, { page: 0, sort: 'minimo' })
    expect(calls).toContainEqual(['eq', ['is_lowest', true]])
  })
})

describe('parseDealSort', () => {
  it('falls back to recientes', () => {
    expect(parseDealSort('xyz')).toBe('recientes')
    expect(parseDealSort(undefined)).toBe('recientes')
    expect(parseDealSort(null)).toBe('recientes')
    expect(parseDealSort('minimo')).toBe('minimo')
    expect(parseDealSort('descuento')).toBe('descuento')
  })
})

describe('fetchHashtags', () => {
  it('returns top tags ordered by count', async () => {
    const { client, calls } = fakeClient({ data: [{ tag: 'lego', count: '5' }], error: null })
    expect(await fetchHashtags(client)).toEqual([{ tag: 'lego', count: 5 }])
    expect(calls).toEqual([
      ['from', ['web_hashtags']],
      ['select', ['tag, count']],
      ['order', ['count', { ascending: false }]],
      ['limit', [12]],
    ])
  })
})

describe('fetchLatestDeal', () => {
  it('returns the newest deal or null', async () => {
    const { client, calls } = fakeClient({ data: [row(7)], error: null })
    expect((await fetchLatestDeal(client))?.publicationId).toBe(7)
    expect(calls).toContainEqual(['limit', [1]])
    const empty = fakeClient({ data: [], error: null })
    expect(await fetchLatestDeal(empty.client)).toBeNull()
  })
})

describe('fetchDealByProduct', () => {
  it('queries by store and uppercase asin', async () => {
    const { client, calls } = fakeClient({ data: [row(3)], error: null })
    expect((await fetchDealByProduct(client, 'amazon', 'b0bpzvjjqj'))?.publicationId).toBe(3)
    expect(calls).toContainEqual(['from', ['web_deals']])
    expect(calls).toContainEqual(['eq', ['store', 'amazon']])
    expect(calls).toContainEqual(['eq', ['asin', 'B0BPZVJJQJ']])
  })
  it('returns null when missing', async () => {
    const { client } = fakeClient({ data: [], error: null })
    expect(await fetchDealByProduct(client, 'amazon', 'b0bpzvjjqj')).toBeNull()
  })
})

describe('fetchRelatedDeals', () => {
  const deal = { ...toDealLike(), hashtags: ['lego', 'otro'] }
  function toDealLike() {
    return {
      publicationId: 5, publishedAt: '', price: 1, previousPrice: null, coupon: null, hashtags: [] as string[],
      affiliateUrl: '', title: 't', imageUrl: null, asin: 'B000000000', country: 'ES', store: 'amazon', productId: 5, discountPct: null, previousMinPrice: null, isLowest: false,
    }
  }
  it('filters by first hashtag and excludes itself', async () => {
    const { client, calls } = fakeClient({ data: [row(1), row(2)], error: null })
    const out = await fetchRelatedDeals(client, deal, 10)
    expect(out).toHaveLength(2)
    expect(calls).toContainEqual(['contains', ['hashtags', ['lego']]])
    expect(calls).toContainEqual(['neq', ['publication_id', 5]])
    expect(calls).toContainEqual(['limit', [10]])
  })
  it('falls back to latest deals without hashtags', async () => {
    const { client, calls } = fakeClient({ data: [row(1)], error: null })
    await fetchRelatedDeals(client, { ...deal, hashtags: [] })
    expect(calls.find((c) => c[0] === 'contains')).toBeUndefined()
    expect(calls).toContainEqual(['neq', ['publication_id', 5]])
  })
  it('falls back to latest when the tag has no other deals', async () => {
    let n = 0
    const results = [[], [row(9)]]
    const { client } = fakeClient({ data: [], error: null })
    const builder = (client.from as unknown as () => Record<string, unknown>)()
    builder.then = (resolve: (r: Result) => unknown) =>
      Promise.resolve({ data: results[n++], error: null }).then(resolve)
    const out = await fetchRelatedDeals(client, deal)
    expect(out.map((d) => d.publicationId)).toEqual([9])
  })
})

describe('fetchAllDealRefs', () => {
  it('paginates by 1000 until a short page', async () => {
    const ranges: unknown[] = []
    const pages = [
      Array.from({ length: 1000 }, (_, i) => row(i)),
      [row(1000)],
    ]
    let n = 0
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'order']) builder[name] = () => builder
    builder.range = (...a: unknown[]) => {
      ranges.push(a)
      return Promise.resolve({ data: pages[n++], error: null })
    }
    const client = { from: () => builder } as unknown as SupabaseClient
    const refs = await fetchAllDealRefs(client)
    expect(ranges).toEqual([[0, 999], [1000, 1999]])
    expect(refs).toHaveLength(1001)
    expect(refs[0]).toEqual({ store: 'amazon', asin: 'B000000000', title: 'Item 0', publishedAt: '2026-11-04T10:00:00Z' })
  })
})

describe('fetchHashtagCounts', () => {
  it('returns all tags', async () => {
    const { client } = fakeClient({ data: [{ tag: 'lego', count: '5' }], error: null })
    expect(await fetchHashtagCounts(client)).toEqual([{ tag: 'lego', count: 5 }])
  })
})

describe('fetchHashtagCount', () => {
  it('reads one tag count', async () => {
    const { client, calls } = fakeClient({ data: [{ tag: 'niños', count: '4' }], error: null })
    expect(await fetchHashtagCount(client, 'niños')).toBe(4)
    expect(calls).toEqual([
      ['from', ['web_hashtags']],
      ['select', ['count']],
      ['eq', ['tag', 'niños']],
      ['limit', [1]],
    ])
  })

  it('returns null for an unknown tag and rejects on error', async () => {
    expect(await fetchHashtagCount(fakeClient({ data: [], error: null }).client, 'x')).toBeNull()
    await expect(
      fetchHashtagCount(fakeClient({ data: null, error: { message: 'boom' } }).client, 'x'),
    ).rejects.toThrow('boom')
  })
})
