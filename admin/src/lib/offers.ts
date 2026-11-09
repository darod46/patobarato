import type { SupabaseClient } from '@supabase/supabase-js'

export type OfferFilter = 'active' | 'draft' | 'ended'
export type PublicationStatus = OfferFilter
export type Channel = 'telegram' | 'web'

export type OfferRow = {
  id: number
  title: string
  store: string
  imageUrl: string | null
  price: number
  status: PublicationStatus
  channel: Channel
  hasMessage: boolean
  publishedAt: string
}

export type OfferDetail = {
  id: number
  offerId: number
  productId: number
  title: string
  store: string
  imageUrl: string | null
  price: number
  previousPrice: number | null
  coupon: string | null
  priceBeforeCoupon: boolean
  hashtags: string[]
  affiliateUrl: string
  status: PublicationStatus
  channel: Channel
  messageId: number | null
  publishedAt: string
  /** Draft only: when the bot auto-published the same product after this draft was created. */
  botPublishedAt: string | null
}

export type OfferPatch = {
  title: string
  price: number
  previousPrice: number | null
  coupon: string | null
  priceBeforeCoupon: boolean
  hashtags: string[]
}

const JOINED = '*, offers(previous_price, coupon, hashtags), products(title, store, image_url)'
const JOINED_INNER = '*, offers(previous_price, coupon, hashtags), products!inner(title, store, image_url)'
const LIMIT = 200

// oxlint-disable-next-line no-explicit-any
type Row = any

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function listOffers(
  client: SupabaseClient,
  { filter, q }: { filter: OfferFilter; q?: string },
): Promise<OfferRow[]> {
  const term = q?.trim()
  let query = client.from('publications').select(term ? JOINED_INNER : JOINED).eq('status', filter)
  if (term) query = query.ilike('products.title', `%${term}%`)
  const { data, error } = await query.order('published_at', { ascending: false }).limit(LIMIT)
  fail(error)
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.products?.title ?? '',
    store: r.products?.store ?? '',
    imageUrl: r.products?.image_url ?? null,
    price: Number(r.published_price),
    status: r.status,
    channel: r.channel,
    hasMessage: r.message_id !== null && r.message_id !== undefined,
    publishedAt: r.published_at,
  }))
}

export async function getOffer(client: SupabaseClient, publicationId: number | string): Promise<OfferDetail> {
  const { data, error } = await client.from('publications').select(JOINED).eq('id', publicationId).single()
  fail(error)
  const r = data as Row
  const previous = r.offers?.previous_price
  const detail: OfferDetail = {
    id: r.id,
    offerId: r.offer_id,
    productId: r.product_id,
    title: r.products?.title ?? '',
    store: r.products?.store ?? '',
    imageUrl: r.products?.image_url ?? null,
    price: Number(r.published_price),
    previousPrice: previous === null || previous === undefined ? null : Number(previous),
    coupon: r.offers?.coupon ?? null,
    priceBeforeCoupon: Boolean(r.price_before_coupon),
    hashtags: r.offers?.hashtags ?? [],
    affiliateUrl: r.affiliate_url ?? '',
    status: r.status,
    channel: r.channel,
    messageId: r.message_id ?? null,
    publishedAt: r.published_at,
    botPublishedAt: null,
  }
  if (detail.status === 'draft') {
    detail.botPublishedAt = await telegramPublicationAfter(client, detail.productId, detail.publishedAt)
  }
  return detail
}

/** Writes the title (products), price (publications) and previous price, coupon and hashtags (offers). */
export async function saveOffer(client: SupabaseClient, id: number, patch: OfferPatch): Promise<void> {
  const { data, error } = await client.from('publications').select('offer_id, product_id').eq('id', id).single()
  fail(error)
  const { offer_id, product_id } = data as Row
  const products = await client.from('products').update({ title: patch.title }).eq('id', product_id)
  fail(products.error)
  const publications = await client
    .from('publications')
    .update({ published_price: patch.price, price_before_coupon: patch.priceBeforeCoupon })
    .eq('id', id)
  fail(publications.error)
  const offers = await client
    .from('offers')
    .update({ previous_price: patch.previousPrice, coupon: patch.coupon, hashtags: patch.hashtags })
    .eq('id', offer_id)
  fail(offers.error)
}

export async function setOfferStatus(client: SupabaseClient, id: number, status: 'active' | 'ended'): Promise<void> {
  const { error } = await client
    .from('publications')
    .update({ status, ended_at: status === 'ended' ? new Date().toISOString() : null })
    .eq('id', id)
  fail(error)
}

/** Latest active/ended Telegram publication of the product with `published_at` after `after`. */
async function telegramPublicationAfter(client: SupabaseClient, productId: number, after: string): Promise<string | null> {
  const { data, error } = await client
    .from('publications')
    .select('published_at')
    .eq('product_id', productId)
    .eq('channel', 'telegram')
    .in('status', ['active', 'ended'])
    .gt('published_at', after)
    .order('published_at', { ascending: false })
    .limit(1)
  fail(error)
  return (data as Row[] | null)?.[0]?.published_at ?? null
}

/** `published_at` of an active or ended Telegram publication of the product within the last `days` days. */
export async function recentTelegramPublication(client: SupabaseClient, productId: number, days = 7): Promise<string | null> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  return telegramPublicationAfter(client, productId, since)
}
