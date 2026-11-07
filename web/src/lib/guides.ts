import { discountPercent, timeAgo } from './format'
import type { GuideCoupon, GuideStoreOffer } from './types'

const HOUR_MS = 3_600_000
const FRESH_MS = 48 * HOUR_MS

/** Price after applying a structured coupon; null when it does not apply or yields a non-positive price. */
export function finalPrice(price: number | null, coupon: GuideCoupon | null, now: Date): number | null {
  if (price === null || coupon === null) return null
  if (coupon.expiresAt !== null && new Date(coupon.expiresAt).getTime() <= now.getTime()) return null
  if (coupon.minPurchase !== null && price < coupon.minPurchase) return null
  let result: number
  // Structured values must be positive; when both are set, the fixed amount wins over the percentage.
  if (coupon.discountAmount !== null && coupon.discountAmount > 0) result = price - coupon.discountAmount
  else if (coupon.discountPct !== null && coupon.discountPct > 0) result = price * (1 - coupon.discountPct / 100)
  else return null
  result = Math.round(result * 100) / 100
  return result > 0 ? result : null
}

/** Amazon always monetises through /go/ (tag added); any other store needs an affiliate link to be shown at all. */
export function hasAffiliate(offer: GuideStoreOffer): boolean {
  return offer.store === 'amazon' || Boolean(offer.affiliateUrl)
}

/** Checked within 48 h, no price error and a known price. */
export function isRecent(offer: GuideStoreOffer, now: Date): boolean {
  return (
    !offer.priceError &&
    offer.price !== null &&
    offer.checkedAt !== null &&
    now.getTime() - new Date(offer.checkedAt).getTime() < FRESH_MS
  )
}

/** Cheapest recent offer, comparing the coupon-adjusted price when one applies. Ties keep array order. */
export function bestOffer(
  stores: GuideStoreOffer[],
  now: Date,
): { store: string; price: number; withCoupon: boolean; offer: GuideStoreOffer } | null {
  let best: { store: string; price: number; withCoupon: boolean; offer: GuideStoreOffer } | null = null
  for (const s of stores) {
    if (!hasAffiliate(s) || !isRecent(s, now) || s.price === null) continue
    const withCoupon = finalPrice(s.price, s.coupon, now)
    const price = withCoupon ?? s.price
    if (best === null || price < best.price) best = { store: s.store, price, withCoupon: withCoupon !== null, offer: s }
  }
  return best
}

export function freshnessLabel(checkedAt: string | null, now: Date): string {
  if (checkedAt === null) return 'Precios no disponibles'
  const raw = now.getTime() - new Date(checkedAt).getTime()
  if (Number.isNaN(raw)) return 'Precios no disponibles'
  const age = Math.max(0, raw)
  if (age < FRESH_MS) return `Precios revisados ${age === 0 ? timeAgo(now.toISOString(), now) : timeAgo(checkedAt, now)}`
  return `Precios de hace ${Math.floor(age / (24 * HOUR_MS))} días`
}

export function discountPct(price: number | null, previousPrice: number | null): number | null {
  if (price === null || previousPrice === null) return null
  return discountPercent(price, previousPrice)
}

/** True when the price is at (or below) the previous historical minimum. */
export function isLowest(price: number, previousMinPrice: number | null): boolean {
  return previousMinPrice !== null && price <= previousMinPrice
}

export function guidePath(slug: string): string {
  return `/guias/${slug}`
}

/** Guide prices were checked within 48 h (guides without that are served but kept out of the index). */
export function hasFreshPrices(checkedAt: string | null, now: Date): boolean {
  if (checkedAt === null) return false
  const age = now.getTime() - new Date(checkedAt).getTime()
  return !Number.isNaN(age) && age >= 0 && age < FRESH_MS
}
