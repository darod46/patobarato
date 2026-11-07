export type Deal = {
  publicationId: number
  publishedAt: string
  price: number
  previousPrice: number | null
  coupon: string | null
  hashtags: string[]
  affiliateUrl: string
  title: string
  imageUrl: string | null
  asin: string
  country: string
  store: string
  productId: number
  /** Server-side discount percentage; null without a previous price. */
  discountPct: number | null
  /** Lowest price of earlier publications of this product; null without history. */
  previousMinPrice: number | null
  /** True only when there is history and the current price is at or below its minimum. */
  isLowest: boolean
}

export type HashtagCount = { tag: string; count: number }

export type Coupon = {
  id: number
  store: string
  code: string
  title: string
  conditions: string | null
  url: string | null
  startsAt: string
  expiresAt: string | null
  /** Fixed amount off, in the store currency; null when the coupon is not an amount discount. */
  discountAmount: number | null
  /** Percentage off; null when the coupon is not a percentage discount. */
  discountPct: number | null
  /** Minimum cart value required; null when none. */
  minPurchase: number | null
}

export type GuideSummary = {
  slug: string
  title: string
  subtitle: string
  category: string
  author: string
  readingMinutes: number
  publishedAt: string
  updatedAt: string
  items: number
  pricesCheckedAt: string | null
}

export type GuideCoupon = {
  code: string
  title: string
  expiresAt: string | null
  discountAmount: number | null
  discountPct: number | null
  minPurchase: number | null
}

export type GuideStoreOffer = {
  store: string
  externalId: string
  url: string
  note: string | null
  productId: number | null
  price: number | null
  previousPrice: number | null
  currency: string
  checkedAt: string | null
  priceError: boolean
  previousMinPrice: number | null
  coupon: GuideCoupon | null
}

export type GuideItem = {
  id: number
  position: number
  name: string
  award: string | null
  summaryMd: string
  pros: string[]
  cons: string[]
  specs: { label: string; value: string }[]
  imageUrl: string | null
  stores: GuideStoreOffer[]
}

export type Guide = Omit<GuideSummary, 'items'> & {
  introMd: string
  howToChooseMd: string
  faq: { q: string; aMd: string }[]
  items: GuideItem[]
}
