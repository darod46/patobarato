import { describe, expect, it } from 'vitest'
import { fakeClient } from '../test-utils/fakeClient'
import { fetchCoupons } from './coupons'
import { storeNames } from './stores'

const row = {
  id: 1,
  store: 'aliexpress',
  code: 'PATO6',
  title: '−6 € en 40 €',
  conditions: null,
  url: null,
  starts_at: '2026-11-01T00:00:00Z',
  expires_at: null,
  discount_amount: '6',
  discount_pct: null,
  min_purchase: 40,
}

describe('fetchCoupons', () => {
  it('reads web_coupons ordered by store and expiry', async () => {
    const { client, calls } = fakeClient({ data: [row], error: null })
    const coupons = await fetchCoupons(client, 4)
    expect(calls).toEqual([
      ['from', ['web_coupons']],
      ['select', ['*']],
      ['order', ['store', { ascending: true }]],
      ['order', ['expires_at', { ascending: true, nullsFirst: false }]],
      ['limit', [4]],
    ])
    expect(coupons[0]).toEqual({
      id: 1,
      store: 'aliexpress',
      code: 'PATO6',
      title: '−6 € en 40 €',
      conditions: null,
      url: null,
      startsAt: '2026-11-01T00:00:00Z',
      expiresAt: null,
      discountAmount: 6,
      discountPct: null,
      minPurchase: 40,
      eventId: null,
    })
  })

  it('maps missing coupon values to null', async () => {
    const { client } = fakeClient({ data: [{ ...row, discount_amount: undefined, discount_pct: 15, min_purchase: undefined }], error: null })
    const [c] = await fetchCoupons(client)
    expect(c).toMatchObject({ discountAmount: null, discountPct: 15, minPurchase: null })
  })

  it('does not limit when no limit is given', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchCoupons(client)
    expect(calls.map((c) => c[0])).not.toContain('limit')
  })

  it('filters by store when given', async () => {
    const { client, calls } = fakeClient({ data: [], error: null })
    await fetchCoupons(client, 50, 'aliexpress')
    expect(calls).toContainEqual(['eq', ['store', 'aliexpress']])
    expect(calls).toContainEqual(['limit', [50]])
  })

  it('fetchCoupons filters by event id and maps eventId', async () => {
    const { client, calls } = fakeClient({ data: [{ ...row, event_id: '3' }], error: null })
    const [c] = await fetchCoupons(client, undefined, undefined, 3)
    expect(calls).toContainEqual(['eq', ['event_id', 3]])
    expect(c.eventId).toBe(3)
  })

  it('rejects on error', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } })
    await expect(fetchCoupons(client)).rejects.toThrow('boom')
  })
})

describe('storeNames', () => {
  it('keeps Amazon first and dedupes', () => {
    expect(storeNames(['pccomponentes', 'amazon', 'pccomponentes', 'aliexpress'])).toEqual([
      'Amazon',
      'PcComponentes',
      'AliExpress',
    ])
  })
  it('uses the raw id for unknown stores', () => {
    expect(storeNames(['fnac'])).toEqual(['fnac'])
  })
})
