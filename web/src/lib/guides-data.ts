import type { SupabaseClient } from '@supabase/supabase-js'
import { numOrNull } from './coupons'
import type { Guide, GuideItem, GuideStoreOffer, GuideSummary } from './types'

type Num = number | string | null | undefined

type GuideRow = {
  slug: string
  title: string
  subtitle: string | null
  category: string
  author: string
  reading_minutes: Num
  published_at: string
  updated_at: string
  intro_md: string
  how_to_choose_md: string
  faq: unknown
  items: Num
  prices_checked_at: string | null
}

type GuideItemRow = {
  item_id: Num
  position: Num
  name: string
  award: string | null
  summary_md: string
  pros: string[] | null
  cons: string[] | null
  specs: unknown
  image_url: string | null
  store: string
  external_id: string
  url: string
  affiliate_url?: string | null
  note: string | null
  product_id: Num
  price: Num
  previous_price: Num
  currency: string
  checked_at: string | null
  price_error: boolean | null
  previous_min_price: Num
  coupon_code: string | null
  coupon_title: string | null
  coupon_expires_at: string | null
  discount_amount: Num
  discount_pct: Num
  min_purchase: Num
}

/** jsonb normally arrives parsed, but accept a JSON string too; anything unusable becomes an empty list. */
function jsonList<T>(value: unknown): T[] {
  let v = value
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v)
    } catch {
      return []
    }
  }
  return Array.isArray(v) ? (v as T[]) : []
}

function toSummary(row: GuideRow): GuideSummary {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    category: row.category,
    author: row.author,
    readingMinutes: Number(row.reading_minutes),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    items: Number(row.items),
    pricesCheckedAt: row.prices_checked_at,
  }
}

function toOffer(row: GuideItemRow): GuideStoreOffer {
  return {
    store: row.store,
    externalId: row.external_id,
    url: row.url,
    affiliateUrl: row.affiliate_url ?? null,
    note: row.note,
    productId: numOrNull(row.product_id),
    price: numOrNull(row.price),
    previousPrice: numOrNull(row.previous_price),
    currency: row.currency,
    checkedAt: row.checked_at,
    priceError: row.price_error === true,
    previousMinPrice: numOrNull(row.previous_min_price),
    coupon:
      row.coupon_code === null
        ? null
        : {
            code: row.coupon_code,
            title: row.coupon_title ?? '',
            expiresAt: row.coupon_expires_at,
            discountAmount: numOrNull(row.discount_amount),
            discountPct: numOrNull(row.discount_pct),
            minPurchase: numOrNull(row.min_purchase),
          },
  }
}

/** Groups the item×store rows (already ordered by position, store_position) into items, keeping that order. */
function groupItems(rows: GuideItemRow[]): GuideItem[] {
  const items = new Map<number, GuideItem>()
  for (const row of rows) {
    const id = Number(row.item_id)
    let item = items.get(id)
    if (!item) {
      item = {
        id,
        position: Number(row.position),
        name: row.name,
        award: row.award,
        summaryMd: row.summary_md,
        pros: row.pros ?? [],
        cons: row.cons ?? [],
        specs: jsonList<{ label: string; value: string }>(row.specs),
        imageUrl: row.image_url,
        stores: [],
      }
      items.set(id, item)
    }
    item.stores.push(toOffer(row))
  }
  return [...items.values()]
}

/** All published guides, newest first. */
export async function fetchGuides(client: SupabaseClient): Promise<GuideSummary[]> {
  const { data, error } = await client.from('web_guides').select('*').order('published_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as GuideRow[]).map(toSummary)
}

/** One guide with its items grouped from `web_guide_items`; null when the slug does not exist. */
export async function fetchGuide(client: SupabaseClient, slug: string): Promise<Guide | null> {
  const [guideRes, itemsRes] = await Promise.all([
    client.from('web_guides').select('*').eq('slug', slug).limit(1),
    client
      .from('web_guide_items')
      .select('*')
      .eq('guide_slug', slug)
      .order('position', { ascending: true })
      .order('store_position', { ascending: true })
      .order('store', { ascending: true }),
  ])
  if (guideRes.error) throw new Error(guideRes.error.message)
  if (itemsRes.error) throw new Error(itemsRes.error.message)
  const row = ((guideRes.data ?? []) as GuideRow[])[0]
  if (!row) return null
  const { items: _count, ...summary } = toSummary(row)
  return {
    ...summary,
    introMd: row.intro_md,
    howToChooseMd: row.how_to_choose_md,
    faq: jsonList<{ q: string; a_md: string }>(row.faq).map((f) => ({ q: f.q, aMd: f.a_md })),
    items: groupItems((itemsRes.data ?? []) as GuideItemRow[]),
  }
}

/** Guides that feature a product (for the "Featured in" links on deal pages). */
export async function fetchGuidesByProduct(
  client: SupabaseClient,
  productId: number,
): Promise<{ slug: string; title: string }[]> {
  const { data, error } = await client.from('web_guides_by_product').select('*').eq('product_id', productId)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { guide_slug: string; guide_title: string }[]).map((r) => ({
    slug: r.guide_slug,
    title: r.guide_title,
  }))
}
