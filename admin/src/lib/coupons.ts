import type { SupabaseClient } from '@supabase/supabase-js'

export type CouponFilter = 'active' | 'expired' | 'all'

export type CouponInput = {
  store: string
  code: string
  title: string
  conditions: string | null
  url: string | null
  /** ISO instant; null keeps the database default (now) on insert and leaves it unchanged on update. */
  startsAt: string | null
  expiresAt: string | null
  active: boolean
  discountAmount: number | null
  discountPct: number | null
  minPurchase: number | null
  eventId: number | null
}

export type CouponRow = {
  id: number
  store: string
  code: string
  title: string
  expiresAt: string | null
  active: boolean
}

export type CouponDetail = CouponInput & { id: number; sourceId: number | null }

export type EventOption = { id: number; name: string }

const LIMIT = 200

// oxlint-disable-next-line no-explicit-any
type Row = any

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Escapes a search term for use as a quoted ilike pattern inside a PostgREST `or(...)` filter. */
export function searchPattern(term: string): string {
  const like = term.replace(/[\\%_]/g, (c) => `\\${c}`)
  const quoted = like.replace(/[\\"]/g, (c) => `\\${c}`)
  return `"%${quoted}%"`
}

export async function listCoupons(
  client: SupabaseClient,
  { filter, q }: { filter: CouponFilter; q?: string },
): Promise<CouponRow[]> {
  const now = new Date().toISOString()
  let query = client.from('coupons').select('id, store, code, title, expires_at, active')
  if (filter === 'active') query = query.eq('active', true).or(`expires_at.is.null,expires_at.gt.${now}`)
  else if (filter === 'expired') query = query.or(`expires_at.lte.${now},active.eq.false`)
  const term = q?.trim()
  if (term) {
    const p = searchPattern(term)
    query = query.or(`title.ilike.${p},code.ilike.${p}`)
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(LIMIT)
  fail(error)
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    store: r.store,
    code: r.code,
    title: r.title,
    expiresAt: r.expires_at ?? null,
    active: Boolean(r.active),
  }))
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

export async function getCoupon(client: SupabaseClient, id: number | string): Promise<CouponDetail> {
  const { data, error } = await client.from('coupons').select('*').eq('id', id).single()
  fail(error)
  const r = data as Row
  return {
    id: r.id,
    store: r.store,
    code: r.code,
    title: r.title,
    conditions: r.conditions ?? null,
    url: r.url ?? null,
    startsAt: r.starts_at ?? null,
    expiresAt: r.expires_at ?? null,
    active: Boolean(r.active),
    discountAmount: num(r.discount_amount),
    discountPct: num(r.discount_pct),
    minPurchase: num(r.min_purchase),
    eventId: num(r.event_id),
    sourceId: num(r.source_id),
  }
}

export async function listEvents(client: SupabaseClient): Promise<EventOption[]> {
  const { data, error } = await client.from('events').select('id, name').order('name')
  fail(error)
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, name: r.name }))
}

/** Creates (no id) or updates (id) a coupon and returns its id. */
export async function saveCoupon(client: SupabaseClient, coupon: CouponInput & { id?: number }): Promise<number> {
  const row: Record<string, unknown> = {
    store: coupon.store,
    code: coupon.code,
    title: coupon.title,
    conditions: coupon.conditions,
    url: coupon.url,
    expires_at: coupon.expiresAt,
    active: coupon.active,
    discount_amount: coupon.discountAmount,
    discount_pct: coupon.discountPct,
    min_purchase: coupon.minPurchase,
    event_id: coupon.eventId,
  }
  if (coupon.startsAt) row.starts_at = coupon.startsAt
  if (coupon.id !== undefined) row.id = coupon.id
  const { data, error } = await client.from('coupons').upsert(row).select('id').single()
  fail(error)
  if (!data) throw new Error('No se pudo guardar el cupón')
  return (data as Row).id as number
}
