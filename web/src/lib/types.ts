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
}

export type HashtagCount = { tag: string; count: number }
