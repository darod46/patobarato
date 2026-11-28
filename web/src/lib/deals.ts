import type { SupabaseClient } from '@supabase/supabase-js'
import { categoryArt, categoryKey, displayImage } from './category-art'
import { madridDayBounds } from './events'
import { pricesVisible } from './flags'
import { escapeIlike } from './format'
import type { Deal, HashtagCount } from './types'

export const PAGE_SIZE = 24

export const ENDED_INDEXABLE_DAYS = 30

/** Active deals, and ended ones for `ENDED_INDEXABLE_DAYS` after they ended, may be indexed. */
export function isDealIndexable(deal: Pick<Deal, 'status' | 'endedAt' | 'tracked'>, now: Date): boolean {
  // Pages of products only followed by price alerts are not deals: reachable, not indexed.
  if (deal.tracked) return false
  if (deal.status === 'active') return true
  if (!deal.endedAt) return false
  return now.getTime() - new Date(deal.endedAt).getTime() <= ENDED_INDEXABLE_DAYS * 86400000
}

export type DealSort = 'recientes' | 'descuento' | 'minimo'
export const DEAL_SORTS: readonly DealSort[] = ['recientes', 'descuento', 'minimo']

/** Normalizes a raw `orden` value; anything unknown is the default order. */
export function parseDealSort(raw: string | null | undefined): DealSort {
  return (DEAL_SORTS as readonly string[]).includes(raw ?? '') ? (raw as DealSort) : 'recientes'
}

type DealRow = {
  publication_id: number | string | null
  published_at: string
  price: number | string
  previous_price: number | string | null
  coupon: string | null
  hashtags: string[] | null
  affiliate_url: string
  title: string
  image_url: string | null
  asin: string
  country: string
  store: string
  product_id: number | string
  discount_pct?: number | string | null
  previous_min_price?: number | string | null
  is_lowest?: boolean | null
  price_before_coupon?: boolean | null
  status?: string
  ended_at?: string | null
  slug?: string | null
  description?: string | null
  category?: string | null
  short_title?: string | null
}

function toDeal(row: DealRow): Deal {
  const key = categoryKey(row.hashtags ?? [], row.category)
  // Hidden prices never leave the server, not even in the page payload (lib/flags.ts).
  const hide = !pricesVisible(row.store)
  return {
    publicationId: Number(row.publication_id),
    publishedAt: row.published_at,
    price: hide ? 0 : Number(row.price),
    previousPrice: hide || row.previous_price == null ? null : Number(row.previous_price),
    coupon: row.coupon,
    hashtags: row.hashtags ?? [],
    affiliateUrl: row.affiliate_url,
    // The short name DeepSeek writes for the web (or the admin); the store's long title until there is one.
    title: row.short_title?.trim() || row.title,
    // Never an Amazon-hosted image (see category-art.ts): Amazon deals show their category's duck.
    imageUrl: row.store === 'amazon' ? categoryArt(key) : displayImage(row.image_url, key),
    asin: row.asin,
    country: row.country,
    store: row.store,
    productId: Number(row.product_id),
    discountPct: hide || row.discount_pct == null ? null : Number(row.discount_pct),
    previousMinPrice: hide || row.previous_min_price == null ? null : Number(row.previous_min_price),
    isLowest: !hide && row.is_lowest === true,
    priceBeforeCoupon: !hide && row.price_before_coupon === true,
    status: row.status === 'ended' ? 'ended' : 'active',
    endedAt: row.ended_at ?? null,
    slug: row.slug ?? null,
    description: row.description?.trim() || null,
    category: row.category ?? null,
    ...(hide && { priceHidden: true }),
    ...(row.publication_id === null && { tracked: true }),
  }
}

export async function fetchDeals(
  client: SupabaseClient,
  params: {
    q?: string
    tag?: string
    store?: string
    sort?: DealSort
    page: number
    event?: { hashtags: string[]; stores: string[]; from: string; to: string }
  },
): Promise<{ deals: Deal[]; hasMore: boolean }> {
  const from = params.page * PAGE_SIZE
  const sort = params.sort ?? 'recientes'
  let query = client.from('web_deals').select('*')
  if (sort === 'minimo') query = query.eq('is_lowest', true)
  if (sort === 'descuento') query = query.order('discount_pct', { ascending: false, nullsFirst: false })
  query = query
    .order('published_at', { ascending: false })
    .order('publication_id', { ascending: false })
    .range(from, from + PAGE_SIZE)
  const q = params.q?.trim()
  if (q) query = query.ilike('title', `%${escapeIlike(q)}%`)
  if (params.tag) query = query.contains('hashtags', [params.tag])
  if (params.store) query = query.eq('store', params.store)
  if (params.event) {
    const { start, end } = madridDayBounds(params.event.from, params.event.to)
    const { hashtags: tags, stores } = params.event
    // Deals tagged for the event always count; date-range deals only from the event's stores (when it has any).
    if (tags.length) {
      const storeCond = stores.length ? `,store.in.(${stores.join(',')})` : ''
      query = query.or(`hashtags.ov.{${tags.join(',')}},and(published_at.gte.${start},published_at.lte.${end}${storeCond})`)
    } else {
      query = query.gte('published_at', start).lte('published_at', end)
      if (stores.length) query = query.in('store', stores)
    }
  }
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as DealRow[]
  return { deals: rows.slice(0, PAGE_SIZE).map(toDeal), hasMore: rows.length > PAGE_SIZE }
}

export async function fetchHashtags(client: SupabaseClient, limit = 12): Promise<HashtagCount[]> {
  const { data, error } = await client
    .from('web_hashtags')
    .select('tag, count')
    .order('count', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return ((data ?? []) as { tag: string; count: number | string }[]).map((r) => ({
    tag: r.tag,
    count: Number(r.count),
  }))
}

export async function fetchLatestDeal(client: SupabaseClient): Promise<Deal | null> {
  const { data, error } = await client
    .from('web_deals')
    .select('*')
    .order('published_at', { ascending: false })
    .order('publication_id', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as DealRow[]
  return rows.length ? toDeal(rows[0]) : null
}

/** A product followed by price alerts (@patobaratobot) and never published: its page, outside every listing. */
async function fetchTrackedProduct(client: SupabaseClient, store: string, id: string): Promise<Deal | null> {
  const { data, error } = await client
    .from('web_tracked_pages')
    .select('*')
    .eq('store', store)
    .eq('asin', store === 'amazon' ? id.toUpperCase() : id)
    .limit(1)
  // Optional: without the view (or on an error) the page is simply not found.
  if (error) return null
  const rows = (data ?? []) as DealRow[]
  return rows.length ? toDeal(rows[0]) : null
}

export async function fetchDealByProduct(
  client: SupabaseClient,
  store: string,
  id: string,
): Promise<Deal | null> {
  const { data, error } = await client
    .from('web_deal_pages')
    .select('*')
    .eq('store', store)
    .eq('asin', store === 'amazon' ? id.toUpperCase() : id)
    .order('published_at', { ascending: false })
    .order('publication_id', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as DealRow[]
  if (rows.length) return toDeal(rows[0])
  return fetchTrackedProduct(client, store, id)
}

async function fetchOthers(client: SupabaseClient, deal: Deal, limit: number, tag?: string) {
  let query = client
    .from('web_deals')
    .select('*')
    .neq('publication_id', deal.publicationId)
    .order('published_at', { ascending: false })
    .order('publication_id', { ascending: false })
    .limit(limit)
  if (tag) query = query.contains('hashtags', [tag])
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as DealRow[]).map(toDeal)
}

export async function fetchRelatedDeals(
  client: SupabaseClient,
  deal: Deal,
  limit = 10,
): Promise<Deal[]> {
  const tag = deal.hashtags[0]
  if (tag) {
    const related = await fetchOthers(client, deal, limit, tag)
    if (related.length) return related
  }
  return fetchOthers(client, deal, limit)
}

const REF_PAGE = 1000

async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += REF_PAGE) {
    const { data, error } = await page(from, from + REF_PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < REF_PAGE) return all
  }
}

export async function fetchAllDealRefs(
  client: SupabaseClient,
  now: Date,
): Promise<Pick<Deal, 'store' | 'asin' | 'title' | 'slug' | 'publishedAt' | 'status' | 'endedAt'>[]> {
  const cutoff = new Date(now.getTime() - ENDED_INDEXABLE_DAYS * 86400000).toISOString()
  const rows = await fetchAllPages<DealRow>((from, to) =>
    client
      .from('web_deal_pages')
      .select('store, asin, title, slug, published_at, status, ended_at')
      .or(`status.eq.active,ended_at.gt.${cutoff}`)
      .order('published_at', { ascending: false })
      .order('publication_id', { ascending: false })
      .range(from, to),
  )
  return rows.map((r) => ({
    store: r.store,
    asin: r.asin,
    title: r.title,
    slug: r.slug ?? null,
    publishedAt: r.published_at,
    status: r.status === 'ended' ? ('ended' as const) : ('active' as const),
    endedAt: r.ended_at ?? null,
  }))
}

export async function fetchHashtagCounts(client: SupabaseClient): Promise<HashtagCount[]> {
  const rows = await fetchAllPages<{ tag: string; count: number | string }>((from, to) =>
    client
      .from('web_hashtags')
      .select('tag, count')
      .order('count', { ascending: false })
      .order('tag', { ascending: true })
      .range(from, to),
  )
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }))
}

/** Number of deals for one hashtag according to `web_hashtags`; null when the tag is not listed. */
export async function fetchHashtagCount(client: SupabaseClient, tag: string): Promise<number | null> {
  const { data, error } = await client.from('web_hashtags').select('count').eq('tag', tag).limit(1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as { count: number | string }[]
  return rows.length ? Number(rows[0].count) : null
}
