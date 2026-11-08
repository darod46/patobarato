import { describe, expect, it } from 'vitest'
import { fakeClient } from '../test-utils/fakeClient'
import { fetchEvent, fetchEventPromos, fetchEvents } from './events-data'

const eventRow = {
  id: 2,
  slug: 'black-friday',
  name: 'Black Friday',
  stores: ['amazon', 'pccomponentes'],
  starts_on: '2026-11-27',
  ends_on: '2026-11-29',
  approximate: false,
  hashtags: ['blackfriday'],
  aliexpress_promo: null,
  intro_md: 'Intro',
  tips_md: 'Tips',
  faq: [{ q: 'Q1', a_md: 'A1' }],
  status: 'published',
  updated_at: '2026-11-05T00:00:00Z',
}

const mapped = {
  id: 2,
  slug: 'black-friday',
  name: 'Black Friday',
  stores: ['amazon', 'pccomponentes'],
  startsOn: '2026-11-27',
  endsOn: '2026-11-29',
  approximate: false,
  hashtags: ['blackfriday'],
  aliexpressPromo: null,
  introMd: 'Intro',
  tipsMd: 'Tips',
  faq: [{ q: 'Q1', aMd: 'A1' }],
  updatedAt: '2026-11-05T00:00:00Z',
}

const promoRow = {
  event_id: 1,
  slug: 'aliexpress-1111',
  external_id: '1005001',
  title: 'Auriculares',
  price: '20.00',
  original_price: '50.00',
  currency: 'EUR',
  image_url: 'https://img/a.jpg',
  affiliate_url: 'https://s.click.aliexpress.com/x',
  position: 1,
  synced_at: '2026-11-06T00:00:00Z',
}

describe('fetchEvents', () => {
  it('maps web_events rows and faq a_md, ordered by starts_on', async () => {
    const { client, calls } = fakeClient({ data: [eventRow], error: null })
    expect(await fetchEvents(client)).toEqual([mapped])
    expect(calls).toEqual([
      ['from', ['web_events']],
      ['select', ['*']],
      ['order', ['starts_on', { ascending: true }]],
    ])
  })
  it('tolerates null lists and a JSON-string faq', async () => {
    const { client } = fakeClient({
      data: [{ ...eventRow, stores: null, hashtags: null, faq: '[{"q":"x","a_md":"y"}]', aliexpress_promo: 'ali-1111' }],
      error: null,
    })
    const [e] = await fetchEvents(client)
    expect(e).toMatchObject({ stores: [], hashtags: [], faq: [{ q: 'x', aMd: 'y' }], aliexpressPromo: 'ali-1111' })
  })
  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchEvents(client)).rejects.toThrow('boom')
  })
})

describe('fetchEvent', () => {
  it('filters by slug', async () => {
    const { client, calls } = fakeClient({ data: [eventRow], error: null })
    expect(await fetchEvent(client, 'black-friday')).toEqual(mapped)
    expect(calls).toContainEqual(['from', ['web_events']])
    expect(calls).toContainEqual(['eq', ['slug', 'black-friday']])
    expect(calls).toContainEqual(['limit', [1]])
  })
  it('returns null for unknown slug', async () => {
    const { client } = fakeClient({ data: [], error: null })
    expect(await fetchEvent(client, 'nope')).toBeNull()
  })
  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchEvent(client, 'x')).rejects.toThrow('boom')
  })
})

describe('fetchEventPromos', () => {
  it('maps promos to CatalogProduct with origin aliexpress, ordered by position', async () => {
    const { client, calls } = fakeClient({ data: [promoRow], error: null })
    expect(await fetchEventPromos(client, 'aliexpress-1111', new Date('2026-11-11T12:00:00Z'))).toEqual([
      {
        origin: 'aliexpress',
        store: 'aliexpress',
        externalId: '1005001',
        title: 'Auriculares',
        price: 20,
        originalPrice: 50,
        discountPct: 60,
        currency: 'EUR',
        imageUrl: 'https://img/a.jpg',
        affiliateUrl: 'https://s.click.aliexpress.com/x',
      },
    ])
    expect(calls).toEqual([
      ['from', ['web_event_promos']],
      ['select', ['*']],
      ['eq', ['slug', 'aliexpress-1111']],
      ['gte', ['synced_at', '2026-11-04T12:00:00.000Z']],
      ['order', ['position', { ascending: true }]],
    ])
  })
  it('claims no discount without a higher original price and drops unpriced rows', async () => {
    const { client } = fakeClient({
      data: [
        { ...promoRow, external_id: 'a', original_price: null },
        { ...promoRow, external_id: 'b', original_price: '15.00' },
        { ...promoRow, external_id: 'c', price: null },
      ],
      error: null,
    })
    const out = await fetchEventPromos(client, 'aliexpress-1111')
    expect(out.map((p) => [p.externalId, p.price, p.originalPrice, p.discountPct])).toEqual([
      ['a', 20, null, null],
      ['b', 20, null, null],
    ])
  })
  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchEventPromos(client, 'x')).rejects.toThrow('boom')
  })
})
