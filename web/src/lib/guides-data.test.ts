import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { fakeClient, type FakeResult } from '../test-utils/fakeClient'
import { fetchGuide, fetchGuides, fetchGuidesByProduct } from './guides-data'

/** Routes `from(table)` to a per-table fake so one client can answer several queries. */
function multiClient(results: Record<string, FakeResult>) {
  const fakes = Object.fromEntries(Object.entries(results).map(([t, r]) => [t, fakeClient(r)]))
  const client = {
    from: (table: string) => (fakes[table].client as unknown as { from: (t: string) => unknown }).from(table),
  } as unknown as SupabaseClient
  return { client, calls: (table: string) => fakes[table].calls }
}

const summaryRow = {
  slug: 'mejores-aspiradoras',
  title: 'Mejores aspiradoras',
  subtitle: 'Sub',
  category: 'hogar',
  author: 'Pato',
  reading_minutes: 7,
  published_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-05T00:00:00Z',
  intro_md: 'Intro',
  how_to_choose_md: 'Choose',
  faq: [{ q: 'Q1', a_md: 'A1' }],
  items: 2,
  prices_checked_at: '2026-11-06T10:00:00Z',
}

const base = {
  guide_slug: 'mejores-aspiradoras',
  summary_md: 'Sum',
  pros: ['p'],
  cons: ['c'],
  specs: [{ label: 'Potencia', value: '100 W' }],
  image_url: null,
  external_id: 'B0',
  note: null,
  product_id: 5,
  price: '99.5',
  previous_price: 120,
  currency: 'EUR',
  checked_at: '2026-11-06T10:00:00Z',
  price_error: false,
  previous_min_price: '95',
  coupon_code: null,
  coupon_title: null,
  coupon_expires_at: null,
  discount_amount: null,
  discount_pct: null,
  min_purchase: null,
  affiliate_url: null as string | null,
}
const itemRows = [
  { ...base, item_id: 1, position: 1, name: 'A', award: 'Mejor', store: 'amazon', url: 'u1', store_position: 1, affiliate_url: 'https://aff/u1' },
  {
    ...base,
    item_id: 1,
    position: 1,
    name: 'A',
    award: 'Mejor',
    store: 'pccomponentes',
    url: 'u2',
    store_position: 2,
    product_id: null,
    price: null,
    previous_price: null,
    previous_min_price: null,
    coupon_code: 'PATO6',
    coupon_title: '-6',
    coupon_expires_at: '2026-12-01T00:00:00Z',
    discount_amount: '6',
    discount_pct: null,
    min_purchase: '40',
  },
  {
    ...base,
    item_id: 2,
    position: 2,
    name: 'B',
    award: null,
    store: 'amazon',
    url: 'u3',
    store_position: 1,
    specs: '[{"label":"Peso","value":"2 kg"}]',
  },
]

describe('fetchGuides', () => {
  it('reads web_guides newest first and maps rows', async () => {
    const { client, calls } = fakeClient({ data: [summaryRow], error: null })
    const guides = await fetchGuides(client)
    expect(calls).toEqual([
      ['from', ['web_guides']],
      ['select', ['*']],
      ['order', ['published_at', { ascending: false }]],
    ])
    expect(guides).toEqual([
      {
        slug: 'mejores-aspiradoras',
        title: 'Mejores aspiradoras',
        subtitle: 'Sub',
        category: 'hogar',
        author: 'Pato',
        readingMinutes: 7,
        publishedAt: '2026-11-01T00:00:00Z',
        updatedAt: '2026-11-05T00:00:00Z',
        items: 2,
        pricesCheckedAt: '2026-11-06T10:00:00Z',
      },
    ])
  })
  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchGuides(client)).rejects.toThrow('boom')
  })
})

describe('fetchGuide', () => {
  it('queries both views by slug and groups store rows into ordered items', async () => {
    const m = multiClient({
      web_guides: { data: [summaryRow], error: null },
      web_guide_items: { data: itemRows, error: null },
    })
    const guide = await fetchGuide(m.client, 'mejores-aspiradoras')
    expect(m.calls('web_guides')).toContainEqual(['eq', ['slug', 'mejores-aspiradoras']])
    expect(m.calls('web_guides')).toContainEqual(['limit', [1]])
    expect(m.calls('web_guide_items')).toContainEqual(['eq', ['guide_slug', 'mejores-aspiradoras']])
    expect(m.calls('web_guide_items').filter((c) => c[0] === 'order')).toEqual([
      ['order', ['position', { ascending: true }]],
      ['order', ['store_position', { ascending: true }]],
      ['order', ['store', { ascending: true }]],
    ])
    expect(guide).not.toBeNull()
    expect(guide!.introMd).toBe('Intro')
    expect(guide!.howToChooseMd).toBe('Choose')
    expect(guide!.faq).toEqual([{ q: 'Q1', aMd: 'A1' }])
    expect(guide!.items.map((i) => [i.id, i.name, i.stores.map((s) => s.store)])).toEqual([
      [1, 'A', ['amazon', 'pccomponentes']],
      [2, 'B', ['amazon']],
    ])
    const [a1, a2] = guide!.items[0].stores
    expect(a1).toMatchObject({ productId: 5, price: 99.5, previousPrice: 120, previousMinPrice: 95, coupon: null, affiliateUrl: 'https://aff/u1' })
    expect(a2).toMatchObject({ productId: null, price: null, previousPrice: null, previousMinPrice: null, affiliateUrl: null })
    expect(a2.coupon).toEqual({
      code: 'PATO6',
      title: '-6',
      expiresAt: '2026-12-01T00:00:00Z',
      discountAmount: 6,
      discountPct: null,
      minPurchase: 40,
    })
    expect(guide!.items[0]).toMatchObject({ award: 'Mejor', pros: ['p'], cons: ['c'], imageUrl: null })
    expect(guide!.items[0].specs).toEqual([{ label: 'Potencia', value: '100 W' }])
    expect(guide!.items[1].specs).toEqual([{ label: 'Peso', value: '2 kg' }])
  })
  it('parses faq given as a JSON string', async () => {
    const m = multiClient({
      web_guides: { data: [{ ...summaryRow, faq: '[{"q":"x","a_md":"y"}]' }], error: null },
      web_guide_items: { data: [], error: null },
    })
    expect((await fetchGuide(m.client, 's'))!.faq).toEqual([{ q: 'x', aMd: 'y' }])
  })
  it('returns null when the guide does not exist', async () => {
    const m = multiClient({
      web_guides: { data: [], error: null },
      web_guide_items: { data: [], error: null },
    })
    expect(await fetchGuide(m.client, 'nope')).toBeNull()
  })
  it('treats a null price_error and null subtitle as false and null', async () => {
    const m = multiClient({
      web_guides: { data: [{ ...summaryRow, subtitle: null }], error: null },
      web_guide_items: { data: [{ ...itemRows[0], price_error: null }], error: null },
    })
    const guide = await fetchGuide(m.client, 's')
    expect(guide!.subtitle).toBeNull()
    expect(guide!.items[0].stores[0].priceError).toBe(false)
  })
  it('rejects when the guide query fails', async () => {
    const m = multiClient({
      web_guides: { data: null, error: { message: 'guide boom' } },
      web_guide_items: { data: [], error: null },
    })
    await expect(fetchGuide(m.client, 's')).rejects.toThrow('guide boom')
  })
  it('rejects when either query fails', async () => {
    const m = multiClient({
      web_guides: { data: [summaryRow], error: null },
      web_guide_items: { data: null, error: { message: 'items boom' } },
    })
    await expect(fetchGuide(m.client, 's')).rejects.toThrow('items boom')
  })
})

describe('fetchGuidesByProduct', () => {
  it('filters by product id and maps slug/title', async () => {
    const { client, calls } = fakeClient({
      data: [{ product_id: 5, guide_slug: 'g', guide_title: 'G' }],
      error: null,
    })
    expect(await fetchGuidesByProduct(client, 5)).toEqual([{ slug: 'g', title: 'G' }])
    expect(calls).toContainEqual(['from', ['web_guides_by_product']])
    expect(calls).toContainEqual(['eq', ['product_id', 5]])
  })
})
