import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchDeals, fetchHashtags, fetchLatestDeal } from './deals'

type Result = { data: unknown; error: { message: string } | null }

function fakeClient(result: Result) {
  const calls: [string, unknown[]][] = []
  const builder: Record<string, unknown> = {}
  for (const name of ['select', 'order', 'range', 'ilike', 'contains', 'limit']) {
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
