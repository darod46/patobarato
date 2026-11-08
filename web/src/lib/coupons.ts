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
  discount_amount?: number | string | null
  discount_pct?: number | string | null
  min_purchase?: number | string | null
  event_id?: number | string | null
}

/** PostgREST may return numeric columns as strings; null and undefined stay null. */
export function numOrNull(v: number | string | null | undefined): number | null {
  return v === null || v === undefined ? null : Number(v)
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
    discountAmount: numOrNull(row.discount_amount),
    discountPct: numOrNull(row.discount_pct),
    minPurchase: numOrNull(row.min_purchase),
    eventId: numOrNull(row.event_id),
  }
}

/** Upper bound of coupons fetched for one store page; a full result means the real count is unknown. */
export const MAX_STORE_COUPONS = 50

/** Currently valid coupons from `web_coupons` (the view already filters by dates and `active`), optionally of one store or one event. */
export async function fetchCoupons(client: SupabaseClient, limit?: number,
  store?: string,
  eventId?: number,
): Promise<Coupon[]> {
  let query = client
    .from('web_coupons')
    .select('*')
    .order('store', { ascending: true })
    .order('expires_at', { ascending: true, nullsFirst: false })
  if (store !== undefined) query = query.eq('store', store)
  if (eventId !== undefined) query = query.eq('event_id', eventId)
  if (limit !== undefined) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return ((data ?? []) as CouponRow[]).map(toCoupon)
}
