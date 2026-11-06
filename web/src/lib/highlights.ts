import type { HeroHighlights } from '../components/Hero'
import type { Coupon, Deal } from './types'

/** The hero badges only state what the first page and the coupons actually contain. */
export function heroHighlights(deals: Deal[], coupons: Coupon[]): HeroHighlights {
  let top: Deal | null = null
  for (const d of deals) {
    if (d.discountPct !== null && (top === null || d.discountPct > top.discountPct!)) top = d
  }
  return {
    topDiscountPct: top?.discountPct ?? null,
    topDiscountTitle: top?.title ?? null,
    latestCouponTitle: coupons[0]?.title ?? null,
    hasLowest: deals.some((d) => d.isLowest),
  }
}
