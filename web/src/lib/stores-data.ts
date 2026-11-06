import type { SupabaseClient } from '@supabase/supabase-js'

export type StoreStats = { store: string; deals: number; coupons: number }

/** Stores with at least one active deal or coupon, from `web_stores`. */
export async function fetchStores(client: SupabaseClient): Promise<StoreStats[]> {
  const { data, error } = await client.from('web_stores').select('store, deals, coupons')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { store: string; deals: number | string; coupons: number | string }[])
    .map((r) => ({ store: r.store, deals: Number(r.deals), coupons: Number(r.coupons) }))
    .filter((x) => x.deals > 0 || x.coupons > 0)
}
