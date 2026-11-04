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
