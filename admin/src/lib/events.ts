import type { SupabaseClient } from '@supabase/supabase-js'

export type EventStatus = 'draft' | 'published'
export type EventFilter = 'all' | 'published' | 'draft'
export type FaqItem = { q: string; a_md: string }

export type EventInput = {
  slug: string
  name: string
  stores: string[]
  /** Plain `yyyy-mm-dd` date, no timezone. */
  startsOn: string
  /** Inclusive `yyyy-mm-dd` date. */
  endsOn: string
  approximate: boolean
  hashtags: string[]
  aliexpressPromo: string | null
  introMd: string
  tipsMd: string
  faq: FaqItem[]
  status: EventStatus
}

export type EventRow = { id: number; slug: string; name: string; startsOn: string; endsOn: string; status: EventStatus }

export type EventDetail = EventInput & { id: number; promoCount: number; lastSyncedAt: string | null }

export const DUPLICATE_SLUG = 'Ese slug ya existe'

const LIMIT = 200

// oxlint-disable-next-line no-explicit-any
type Row = any

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return
  if (error.code === '23505') throw new Error(DUPLICATE_SLUG)
  throw new Error(error.message)
}

export async function listEvents(client: SupabaseClient, { filter }: { filter: EventFilter }): Promise<EventRow[]> {
  let query = client.from('events').select('id, slug, name, starts_on, ends_on, status')
  if (filter !== 'all') query = query.eq('status', filter)
  const { data, error } = await query.order('starts_on', { ascending: false }).limit(LIMIT)
  fail(error)
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    status: r.status,
  }))
}

export async function getEvent(client: SupabaseClient, id: number | string): Promise<EventDetail> {
  const { data, error } = await client.from('events').select('*').eq('id', id).single()
  fail(error)
  const r = data as Row
  const promos = await client
    .from('event_promos')
    .select('synced_at', { count: 'exact' })
    .eq('event_id', r.id)
    .order('synced_at', { ascending: false })
    .limit(1)
  fail(promos.error)
  const last = ((promos.data ?? []) as Row[])[0]
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    stores: r.stores ?? [],
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    approximate: Boolean(r.approximate),
    hashtags: r.hashtags ?? [],
    aliexpressPromo: r.aliexpress_promo ?? null,
    introMd: r.intro_md ?? '',
    tipsMd: r.tips_md ?? '',
    faq: Array.isArray(r.faq) ? r.faq : [],
    status: r.status,
    promoCount: promos.count ?? 0,
    lastSyncedAt: last?.synced_at ?? null,
  }
}

/** Creates (no id) or updates (id) an event and returns its id. A duplicate slug throws «Ese slug ya existe». */
export async function saveEvent(client: SupabaseClient, e: EventInput & { id?: number }): Promise<number> {
  const row: Record<string, unknown> = {
    slug: e.slug,
    name: e.name,
    stores: e.stores,
    starts_on: e.startsOn,
    ends_on: e.endsOn,
    approximate: e.approximate,
    hashtags: e.hashtags,
    aliexpress_promo: e.aliexpressPromo,
    intro_md: e.introMd,
    tips_md: e.tipsMd,
    faq: e.faq,
    status: e.status,
    updated_at: new Date().toISOString(),
  }
  if (e.id !== undefined) row.id = e.id
  const { data, error } = await client.from('events').upsert(row).select('id').single()
  fail(error)
  if (!data) throw new Error('No se pudo guardar el evento')
  return (data as Row).id as number
}
