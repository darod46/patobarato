import type { SupabaseClient } from '@supabase/supabase-js'
import { catalogProductFromRow, type CatalogProduct } from './catalog'
import { numOrNull } from './coupons'
import { jsonList } from './guides-data'
import type { SiteEvent } from './types'

type EventRow = {
  id: number | string
  slug: string
  name: string
  stores: string[] | null
  starts_on: string
  ends_on: string
  approximate: boolean | null
  hashtags: string[] | null
  aliexpress_promo: string | null
  intro_md: string | null
  tips_md: string | null
  faq: unknown
  updated_at: string
}

type EventPromoRow = {
  external_id: string
  title: string
  price: number | string | null
  original_price: number | string | null
  currency: string
  image_url: string | null
  affiliate_url: string
}

function toEvent(row: EventRow): SiteEvent {
  return {
    id: Number(row.id),
    slug: row.slug,
    name: row.name,
    stores: row.stores ?? [],
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    approximate: row.approximate === true,
    hashtags: row.hashtags ?? [],
    aliexpressPromo: row.aliexpress_promo,
    introMd: row.intro_md ?? '',
    tipsMd: row.tips_md ?? '',
    faq: jsonList<{ q: string; a_md: string }>(row.faq).map((f) => ({ q: f.q, aMd: f.a_md })),
    updatedAt: row.updated_at,
  }
}

/** A promo row maps to the catalog shape: `original_price` is the regular price only when above `price`. */
function toPromo(row: EventPromoRow): CatalogProduct | null {
  const price = numOrNull(row.price)
  const original = numOrNull(row.original_price)
  const hasOriginal = price !== null && original !== null && original > price
  const product = catalogProductFromRow({
    store: 'aliexpress',
    external_id: row.external_id,
    title: row.title,
    price: (hasOriginal ? original : price) ?? '',
    sale_price: hasOriginal ? price : null,
    currency: row.currency,
    image_url: row.image_url,
    affiliate_url: row.affiliate_url,
  })
  return product && { ...product, origin: 'aliexpress' }
}

/** All events in `web_events`, by first day. */
export async function fetchEvents(client: SupabaseClient): Promise<SiteEvent[]> {
  const { data, error } = await client.from('web_events').select('*').order('starts_on', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as EventRow[]).map(toEvent)
}

/** One event by slug; null when it does not exist. */
export async function fetchEvent(client: SupabaseClient, slug: string): Promise<SiteEvent | null> {
  const { data, error } = await client.from('web_events').select('*').eq('slug', slug).limit(1)
  if (error) throw new Error(error.message)
  const row = ((data ?? []) as EventRow[])[0]
  return row ? toEvent(row) : null
}

/** The AliExpress products synced for an event, in campaign order; rows without a usable price are dropped. */
export async function fetchEventPromos(client: SupabaseClient, slug: string): Promise<CatalogProduct[]> {
  const { data, error } = await client
    .from('web_event_promos')
    .select('*')
    .eq('slug', slug)
    .order('position', { ascending: true })
  if (error) throw new Error(error.message)
  return ((data ?? []) as EventPromoRow[]).map(toPromo).filter((p): p is CatalogProduct => p !== null)
}
