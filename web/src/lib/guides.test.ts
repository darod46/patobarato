import { describe, expect, it } from 'vitest'
import type { GuideCoupon, GuideStoreOffer } from './types'
import { bestOffer, discountPct, finalPrice, freshnessLabel, guidePath, hasFreshPrices, isLowest, isRecent } from './guides'

const now = new Date('2026-11-07T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

const coupon = (over: Partial<GuideCoupon> = {}): GuideCoupon => ({
  code: 'X',
  title: 't',
  expiresAt: null,
  discountAmount: null,
  discountPct: null,
  minPurchase: null,
  ...over,
})

const offer = (over: Partial<GuideStoreOffer> = {}): GuideStoreOffer => ({
  store: 'amazon',
  externalId: 'e',
  url: 'https://x',
  note: null,
  productId: 1,
  price: 100,
  previousPrice: null,
  currency: 'EUR',
  checkedAt: hoursAgo(1),
  priceError: false,
  previousMinPrice: null,
  coupon: null,
  ...over,
})

describe('finalPrice', () => {
  it('returns null without price or coupon value', () => {
    expect(finalPrice(null, coupon({ discountAmount: 5 }), now)).toBeNull()
    expect(finalPrice(100, null, now)).toBeNull()
    expect(finalPrice(100, coupon(), now)).toBeNull()
  })
  it('applies an amount coupon', () => {
    expect(finalPrice(100, coupon({ discountAmount: 6 }), now)).toBe(94)
  })
  it('applies a pct coupon rounded to cents', () => {
    expect(finalPrice(19.99, coupon({ discountPct: 15 }), now)).toBe(16.99)
  })
  it('is null when minPurchase is not met', () => {
    expect(finalPrice(30, coupon({ discountAmount: 6, minPurchase: 40 }), now)).toBeNull()
    expect(finalPrice(40, coupon({ discountAmount: 6, minPurchase: 40 }), now)).toBe(34)
  })
  it('is null when expired', () => {
    expect(finalPrice(100, coupon({ discountAmount: 6, expiresAt: hoursAgo(1) }), now)).toBeNull()
    expect(finalPrice(100, coupon({ discountAmount: 6, expiresAt: now.toISOString() }), now)).toBeNull()
    expect(finalPrice(100, coupon({ discountAmount: 6, expiresAt: hoursAgo(-1) }), now)).toBe(94)
  })
  it('is null when the result would not be positive', () => {
    expect(finalPrice(15, coupon({ discountAmount: 20 }), now)).toBeNull()
    expect(finalPrice(15, coupon({ discountAmount: 15 }), now)).toBeNull()
  })
})

describe('isRecent', () => {
  it('requires fresh, error-free, priced rows', () => {
    expect(isRecent(offer(), now)).toBe(true)
    expect(isRecent(offer({ checkedAt: hoursAgo(47) }), now)).toBe(true)
    expect(isRecent(offer({ checkedAt: hoursAgo(49) }), now)).toBe(false)
    expect(isRecent(offer({ priceError: true }), now)).toBe(false)
    expect(isRecent(offer({ price: null }), now)).toBe(false)
    expect(isRecent(offer({ checkedAt: null }), now)).toBe(false)
  })
})

describe('bestOffer', () => {
  it('returns null when nothing is usable', () => {
    expect(bestOffer([], now)).toBeNull()
    expect(bestOffer([offer({ priceError: true })], now)).toBeNull()
  })
  it('ignores stale and errored rows', () => {
    const r = bestOffer(
      [
        offer({ store: 'stale', price: 10, checkedAt: hoursAgo(72) }),
        offer({ store: 'err', price: 11, priceError: true }),
        offer({ store: 'ok', price: 50 }),
      ],
      now,
    )
    expect(r).toMatchObject({ store: 'ok', price: 50, withCoupon: false })
    expect(r?.offer.store).toBe('ok')
  })
  it('prefers the coupon-adjusted price', () => {
    const r = bestOffer(
      [offer({ store: 'a', price: 90 }), offer({ store: 'b', price: 100, coupon: coupon({ discountAmount: 20 }) })],
      now,
    )
    expect(r).toMatchObject({ store: 'b', price: 80, withCoupon: true })
  })
  it('keeps the first on ties', () => {
    const r = bestOffer([offer({ store: 'a', price: 50 }), offer({ store: 'b', price: 50 })], now)
    expect(r?.store).toBe('a')
  })
  it('returns the winning offer even when a store appears twice', () => {
    const cheap = offer({ store: 'a', externalId: 'two', price: 40 })
    const r = bestOffer([offer({ store: 'a', externalId: 'one', price: 50 }), cheap], now)
    expect(r?.offer).toBe(cheap)
  })
})

describe('freshnessLabel', () => {
  it('handles recent, old and missing', () => {
    expect(freshnessLabel(hoursAgo(2), now)).toBe('Precios revisados hace 2 h')
    expect(freshnessLabel(hoursAgo(72), now)).toBe('Precios de hace 3 días')
    expect(freshnessLabel(hoursAgo(48), now)).toBe('Precios de hace 2 días')
    expect(freshnessLabel(null, now)).toBe('Precios no disponibles')
  })
})

describe('fix round 1', () => {
  it('48 h boundary is exclusive and consistent with the label', () => {
    const t = hoursAgo(47.9)
    expect(isRecent(offer({ checkedAt: t }), now)).toBe(true)
    expect(freshnessLabel(t, now)).toMatch(/^Precios revisados hace /)
    expect(isRecent(offer({ checkedAt: hoursAgo(48) }), now)).toBe(false)
    expect(freshnessLabel(hoursAgo(48), now)).toBe('Precios de hace 2 días')
  })
  it('freshnessLabel handles garbage and future dates', () => {
    expect(freshnessLabel('not a date', now)).toBe('Precios no disponibles')
    expect(freshnessLabel(hoursAgo(-3), now)).toBe('Precios revisados ahora')
  })
  it('non-positive coupon values are ignored', () => {
    expect(finalPrice(100, coupon({ discountAmount: 0 }), now)).toBeNull()
    expect(finalPrice(100, coupon({ discountPct: -5 }), now)).toBeNull()
    expect(finalPrice(100, coupon({ discountPct: 100 }), now)).toBeNull()
    expect(finalPrice(100, coupon({ discountPct: 120 }), now)).toBeNull()
  })
  it('amount wins over pct when both are set', () => {
    expect(finalPrice(100, coupon({ discountAmount: 10, discountPct: 50 }), now)).toBe(90)
  })
  it('bestOffer is null when every offer is stale', () => {
    expect(bestOffer([offer({ checkedAt: hoursAgo(100) }), offer({ checkedAt: hoursAgo(60) })], now)).toBeNull()
  })
})

describe('discountPct', () => {
  it('is null without a real discount', () => {
    expect(discountPct(100, 100)).toBeNull()
    expect(discountPct(100, 90)).toBeNull()
    expect(discountPct(100, null)).toBeNull()
    expect(discountPct(null, 100)).toBeNull()
  })
  it('computes the percentage', () => {
    expect(discountPct(75, 100)).toBe(25)
  })
})

describe('isLowest', () => {
  it('compares against the previous minimum', () => {
    expect(isLowest(50, null)).toBe(false)
    expect(isLowest(50, 50)).toBe(true)
    expect(isLowest(40, 50)).toBe(true)
    expect(isLowest(60, 50)).toBe(false)
  })
})

describe('guidePath', () => {
  it('builds the path', () => {
    expect(guidePath('mejores-freidoras')).toBe('/guias/mejores-freidoras')
  })
})

describe('hasFreshPrices', () => {
  const now = new Date('2026-11-07T12:00:00Z')
  it('is true only when prices were checked within 48 h', () => {
    expect(hasFreshPrices('2026-11-06T12:00:00Z', now)).toBe(true)
    expect(hasFreshPrices('2026-11-05T11:00:00Z', now)).toBe(false)
    expect(hasFreshPrices(null, now)).toBe(false)
    expect(hasFreshPrices('nope', now)).toBe(false)
  })
})
