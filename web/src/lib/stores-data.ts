import type { SupabaseClient } from '@supabase/supabase-js'
import { storeFromSlug } from './stores'

export type StoreStats = { store: string; deals: number; coupons: number }

/** Known stores with at least one active deal or coupon, from `web_stores`. */
export async function fetchStores(client: SupabaseClient): Promise<StoreStats[]> {
  const { data, error } = await client.from('web_stores').select('store, deals, coupons')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { store: string; deals: number | string; coupons: number | string }[])
    .map((r) => ({ store: r.store, deals: Number(r.deals), coupons: Number(r.coupons) }))
    // Unknown ids (not in STORES) would produce broken links and sitemap entries.
    .filter((x) => storeFromSlug(x.store) !== null && (x.deals > 0 || x.coupons > 0))
}
