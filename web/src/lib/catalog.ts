import type { SupabaseClient } from '@supabase/supabase-js'
import { numOrNull } from './coupons'
import { discountPercent } from './format'

export type CatalogProduct = {
  origin: 'aliexpress' | 'awin'
  store: string
  externalId: string
  title: string
  price: number
  originalPrice: number | null
  discountPct: number | null
  currency: string
  imageUrl: string | null
  affiliateUrl: string
}

export type CatalogRow = {
  store: string
  external_id: string
  title: string
  price: number | string
  sale_price: number | string | null
  currency: string
  image_url: string | null
  affiliate_url: string
}

/** Maps a catalog row (regular `price`, optional lower `sale_price`) to a product; null when it has no usable price. */
export function catalogProductFromRow(row: CatalogRow): CatalogProduct | null {
  const regular = row.price === null || row.price === '' ? NaN : Number(row.price)
  if (!Number.isFinite(regular) || regular <= 0) return null
  const rawSale = numOrNull(row.sale_price)
  const sale = rawSale !== null && Number.isFinite(rawSale) && rawSale > 0 && rawSale < regular ? rawSale : null
  const price = sale ?? regular
  const originalPrice = sale !== null ? regular : null
  return {
    origin: 'awin',
    store: row.store,
    externalId: row.external_id,
    title: row.title,
    price,
    originalPrice,
    discountPct: originalPrice !== null ? discountPercent(price, originalPrice) : null,
    currency: row.currency,
    imageUrl: row.image_url,
    affiliateUrl: row.affiliate_url,
  }
}

export async function fetchCatalogSearch(
  client: SupabaseClient,
  q: string,
  max = 12,
): Promise<CatalogProduct[]> {
  const { data, error } = await client.rpc('web_catalog_search', { q, max })
  if (error) throw new Error(error.message)
  return ((data ?? []) as CatalogRow[])
    .map((row) => catalogProductFromRow(row))
    .filter((p): p is CatalogProduct => p !== null)
}
