import { describe, expect, it } from 'vitest'
import { heroHighlights } from './highlights'
import type { Coupon, Deal } from './types'

const deal = (id: number, discountPct: number | null, isLowest = false): Deal => ({
  publicationId: id, publishedAt: '2026-11-06T09:00:00Z', price: 10, previousPrice: null, coupon: null, hashtags: [],
  affiliateUrl: '', title: `Deal ${id}`, imageUrl: null, asin: `A${id}`, country: 'ES', store: 'amazon', productId: id,
  discountPct, previousMinPrice: null, isLowest,
})
const coupon: Coupon = { id: 1, store: 'aliexpress', code: 'X', title: '−6 € en 40 €', conditions: null, url: null, startsAt: '', expiresAt: null, discountAmount: null, discountPct: null, minPurchase: null, eventId: null }

describe('heroHighlights', () => {
  it('picks the biggest discount, the first coupon and whether any deal is at its lowest', () => {
    expect(heroHighlights([deal(1, 20), deal(2, 42, true), deal(3, null)], [coupon])).toEqual({
      topDiscountPct: 42, topDiscountTitle: 'Deal 2', latestCouponTitle: '−6 € en 40 €', hasLowest: true,
    })
  })
  it('is all empty without data', () => {
    expect(heroHighlights([], [])).toEqual({ topDiscountPct: null, topDiscountTitle: null, latestCouponTitle: null, hasLowest: false })
    expect(heroHighlights([deal(1, null)], []).topDiscountPct).toBeNull()
  })
})
