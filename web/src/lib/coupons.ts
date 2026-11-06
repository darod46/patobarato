import type { SupabaseClient } from '@supabase/supabase-js'
import type { Coupon } from './types'

type CouponRow = {
  id: number | string
  store: string
  code: string
  title: string
  conditions: string | null
  url: string | null
  starts_at: string
  expires_at: string | null
}

function toCoupon(row: CouponRow): Coupon {
  return {
    id: Number(row.id),
    store: row.store,
    code: row.code,
    title: row.title,
    conditions: row.conditions,
    url: row.url,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
  }
}

/** Currently valid coupons from `web_coupons` (the view already filters by dates and `active`), optionally of one store. */
export async function fetchCoupons(client: SupabaseClient, limit?: number, store?: string): Promise<Coupon[]> {
  let query = client
    .from('web_coupons')
    .select('*')
    .order('store', { ascending: true })
    .order('expires_at', { ascending: true, nullsFirst: false })
  if (store !== undefined) query = query.eq('store', store)
  if (limit !== undefined) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as CouponRow[]).map(toCoupon)
}
