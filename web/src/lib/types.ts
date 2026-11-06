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
