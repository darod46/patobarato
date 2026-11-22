import type { SupabaseClient } from '@supabase/supabase-js'

export const TELEGRAM_URL = 'https://t.me/patobarato'

export function messageUrl(messageId: number): string {
  return `${TELEGRAM_URL}/${messageId}`
}

export type CtaPlacement = 'header' | 'hero' | 'block' | 'recent' | 'deal' | 'footer' | 'contact'

export const CTA_PLACEMENTS: readonly CtaPlacement[] = ['header', 'hero', 'block', 'recent', 'deal', 'footer', 'contact']

export function isCtaPlacement(v: unknown): v is CtaPlacement {
  return typeof v === 'string' && (CTA_PLACEMENTS as readonly string[]).includes(v)
}

export type ChannelStats = {
  members: number | null
  checkedAt: string | null
  postedToday: number
  lastPostedAt: string | null
}

export type ChannelPost = { productId: number; title: string; price: number; messageId: number; publishedAt: string }

export type ChannelLive = { stats: ChannelStats; posts: ChannelPost[] }

type StatsRow = {
  members: number | null
  checked_at: string | null
  posted_today: number | string | null
  last_posted_at: string | null
}

type RecentRow = {
  product_id: number | string
  title: string
  price: number | string
  message_id: number | string
  published_at: string
}

/** The single row of `web_channel_stats` (members/dates are null until the bot has measured the channel). */
export async function fetchChannelStats(client: SupabaseClient): Promise<ChannelStats> {
  const { data, error } = await client.from('web_channel_stats').select('*').single()
  if (error) throw new Error(error.message)
  const row = data as StatsRow
  return {
    members: row.members === null ? null : Number(row.members),
    checkedAt: row.checked_at,
    postedToday: Number(row.posted_today ?? 0),
    lastPostedAt: row.last_posted_at,
  }
}

/** The latest channel posts (one per product), newest first. */
export async function fetchChannelRecent(client: SupabaseClient, limit = 3): Promise<ChannelPost[]> {
  const { data, error } = await client
    .from('web_channel_recent')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return ((data ?? []) as RecentRow[]).map((r) => ({
    productId: Number(r.product_id),
    title: r.title,
    price: Number(r.price),
    messageId: Number(r.message_id),
    publishedAt: r.published_at,
  }))
}

/** Subscriber count for display; hidden below 100 so a young channel never looks empty. */
export function formatMembers(n: number | null): string | null {
  if (n === null || n < 100) return null
  return new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(n)
}

export const CATEGORY_TAGS: Record<string, string> = {
  tecnologia: 'tecnología',
  hogar: 'hogar',
  belleza: 'belleza',
  juguetes: 'juguetes',
  alimentacion: 'alimentación',
  deporte: 'deporte',
  moda: 'moda',
  bricolaje: 'bricolaje',
}

/** Label of the first hashtag that is a known category, or null. */
export function categoryLabel(hashtags: string[]): string | null {
  for (const tag of hashtags) {
    const key = tag.replace(/^#/, '').toLowerCase()
    if (Object.hasOwn(CATEGORY_TAGS, key)) return CATEGORY_TAGS[key]
  }
  return null
}
