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
}

export type HashtagCount = { tag: string; count: number }
