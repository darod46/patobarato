import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeIlike } from './format'
import type { Deal, HashtagCount } from './types'

export const PAGE_SIZE = 24

type DealRow = {
  publication_id: number | string
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
}

function toDeal(row: DealRow): Deal {
  return {
    publicationId: Number(row.publication_id),
    publishedAt: row.published_at,
    price: Number(row.price),
    previousPrice: row.previous_price == null ? null : Number(row.previous_price),
    coupon: row.coupon,
    hashtags: row.hashtags ?? [],
    affiliateUrl: row.affiliate_url,
    title: row.title,
    imageUrl: row.image_url,
    asin: row.asin,
    country: row.country,
    store: row.store,
    productId: Number(row.product_id),
  }
}

export async function fetchDeals(
  client: SupabaseClient,
  params: { q?: string; tag?: string; page: number },
): Promise<{ deals: Deal[]; hasMore: boolean }> {
  const from = params.page * PAGE_SIZE
  let query = client
    .from('web_deals')
    .select('*')
    .order('published_at', { ascending: false })
    .order('publication_id', { ascending: false })
    .range(from, from + PAGE_SIZE)
  const q = params.q?.trim()
  if (q) query = query.ilike('title', `%${escapeIlike(q)}%`)
  if (params.tag) query = query.contains('hashtags', [params.tag])
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

export async function fetchDealByProduct(
  client: SupabaseClient,
  store: string,
  id: string,
): Promise<Deal | null> {
  const { data, error } = await client
    .from('web_deals')
    .select('*')
    .eq('store', store)
    .eq('asin', id.toUpperCase())
    .order('published_at', { ascending: false })
    .order('publication_id', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as DealRow[]
  return rows.length ? toDeal(rows[0]) : null
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
): Promise<Pick<Deal, 'store' | 'asin' | 'title' | 'publishedAt'>[]> {
  const rows = await fetchAllPages<DealRow>((from, to) =>
    client
      .from('web_deals')
      .select('store, asin, title, published_at')
      .order('published_at', { ascending: false })
      .order('publication_id', { ascending: false })
      .range(from, to),
  )
  return rows.map((r) => ({
    store: r.store,
    asin: r.asin,
    title: r.title,
    publishedAt: r.published_at,
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
