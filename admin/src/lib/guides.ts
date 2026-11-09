import type { SupabaseClient } from '@supabase/supabase-js'

export type GuideStatus = 'draft' | 'published'
export type GuideFilter = 'all' | 'published' | 'draft'
export type FaqItem = { q: string; a_md: string }
export type Spec = { label: string; value: string }

/** Last price the bot stored for a store link (read-only in the admin). */
export type StorePrice = {
  price: number | null
  previousPrice: number | null
  currency: string
  checkedAt: string
  error: string | null
}

export type StoreLinkInput = {
  id?: number
  store: string
  externalId: string
  url: string
  note: string
  /** Read-only, filled by `getGuide`; ignored when saving. `null` = no price yet. */
  price?: StorePrice | null
}

export type GuideItemInput = {
  id?: number
  name: string
  award: string
  summaryMd: string
  pros: string[]
  cons: string[]
  specs: Spec[]
  imageUrl: string
  stores: StoreLinkInput[]
}

export type GuideInput = {
  slug: string
  title: string
  subtitle: string
  category: string
  introMd: string
  howToChooseMd: string
  faq: FaqItem[]
  author: string
  readingMinutes: number
  status: GuideStatus
  /** Existing `published_at`; the first publish stamps it, later saves keep it. */
  publishedAt: string | null
}

export type GuideRow = { id: number; slug: string; title: string; category: string; status: GuideStatus }

export type GuideDetail = GuideInput & { id: number; items: (GuideItemInput & { id: number })[] }

export const DUPLICATE_SLUG = 'Ese slug ya existe'

const LIMIT = 200
/** Added to `position` while renumbering so `unique (guide_id, position)` never clashes. */
const POSITION_OFFSET = 1000

// oxlint-disable-next-line no-explicit-any
type Row = any

function fail(error: { message: string; code?: string } | null): void {
  if (!error) return
  if (error.code === '23505') throw new Error(DUPLICATE_SLUG)
  throw new Error(error.message)
}

export async function listGuides(client: SupabaseClient, { filter }: { filter: GuideFilter }): Promise<GuideRow[]> {
  let query = client.from('guides').select('id, slug, title, category, status')
  if (filter !== 'all') query = query.eq('status', filter)
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(LIMIT)
  fail(error)
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, slug: r.slug, title: r.title, category: r.category, status: r.status }))
}

export async function getGuide(client: SupabaseClient, id: number | string): Promise<GuideDetail> {
  const g = await client.from('guides').select('*').eq('id', id).single()
  fail(g.error)
  const r = g.data as Row

  const it = await client.from('guide_items').select('*').eq('guide_id', r.id).order('position', { ascending: true })
  fail(it.error)
  const itemRows = (it.data ?? []) as Row[]
  const itemIds = itemRows.map((x) => x.id as number)

  let storeRows: Row[] = []
  if (itemIds.length) {
    const st = await client
      .from('guide_item_stores')
      .select('*')
      .in('guide_item_id', itemIds)
      .order('position', { ascending: true })
      .order('id', { ascending: true })
    fail(st.error)
    storeRows = (st.data ?? []) as Row[]
  }

  // Same join as the web view web_guide_items: products(store, country 'ES', asin = external_id) -> product_prices.
  const prices = new Map<string, StorePrice>()
  if (storeRows.length) {
    const pr = await client
      .from('products')
      .select('id, store, asin')
      .eq('country', 'ES')
      .in('asin', [...new Set(storeRows.map((s) => s.external_id as string))])
    fail(pr.error)
    const products = (pr.data ?? []) as Row[]
    if (products.length) {
      const pp = await client
        .from('product_prices')
        .select('product_id, price, previous_price, currency, checked_at, error')
        .in(
          'product_id',
          products.map((p) => p.id),
        )
      fail(pp.error)
      const byProduct = new Map<number, Row>(((pp.data ?? []) as Row[]).map((p) => [p.product_id, p]))
      for (const p of products) {
        const row = byProduct.get(p.id)
        if (!row) continue
        prices.set(`${p.store}\u0000${p.asin}`, {
          price: row.price === null ? null : Number(row.price),
          previousPrice: row.previous_price === null ? null : Number(row.previous_price),
          currency: row.currency,
          checkedAt: row.checked_at,
          error: row.error ?? null,
        })
      }
    }
  }

  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle ?? '',
    category: r.category,
    introMd: r.intro_md ?? '',
    howToChooseMd: r.how_to_choose_md ?? '',
    faq: Array.isArray(r.faq) ? r.faq : [],
    author: r.author ?? '',
    readingMinutes: r.reading_minutes ?? 5,
    status: r.status,
    publishedAt: r.published_at ?? null,
    items: itemRows.map((x) => ({
      id: x.id,
      name: x.name,
      award: x.award ?? '',
      summaryMd: x.summary_md ?? '',
      pros: x.pros ?? [],
      cons: x.cons ?? [],
      specs: Array.isArray(x.specs) ? x.specs : [],
      imageUrl: x.image_url ?? '',
      stores: storeRows
        .filter((s) => s.guide_item_id === x.id)
        .map((s) => ({
          id: s.id,
          store: s.store,
          externalId: s.external_id,
          url: s.url,
          note: s.note ?? '',
          price: prices.get(`${s.store}\u0000${s.external_id}`) ?? null,
        })),
    })),
  }
}

/** Creates (no id) or updates (id) a guide and returns its id. A duplicate slug throws «Ese slug ya existe». */
export async function saveGuide(client: SupabaseClient, g: GuideInput & { id?: number }): Promise<number> {
  const now = new Date().toISOString()
  const row: Record<string, unknown> = {
    slug: g.slug,
    title: g.title,
    subtitle: g.subtitle || null,
    category: g.category,
    intro_md: g.introMd,
    how_to_choose_md: g.howToChooseMd,
    faq: g.faq,
    author: g.author,
    reading_minutes: g.readingMinutes,
    status: g.status,
    published_at: g.publishedAt ?? (g.status === 'published' ? now : null),
    updated_at: now,
  }
  // `id` is `generated always`, so an upsert that names it would be rejected: update or insert explicitly.
  const { data, error } =
    g.id !== undefined
      ? await client.from('guides').update(row).eq('id', g.id).select('id').single()
      : await client.from('guides').insert(row).select('id').single()
  fail(error)
  if (!data) throw new Error('No se pudo guardar la guía')
  return (data as Row).id as number
}

function itemRow(guideId: number, position: number, it: GuideItemInput): Record<string, unknown> {
  return {
    guide_id: guideId,
    position,
    name: it.name,
    award: it.award || null,
    summary_md: it.summaryMd,
    pros: it.pros,
    cons: it.cons,
    specs: it.specs,
    image_url: it.imageUrl || null,
  }
}

function checkStores(items: GuideItemInput[]): void {
  for (const it of items) {
    const seen = new Set<string>()
    for (const s of it.stores) {
      if (seen.has(s.store)) throw new Error(`La tienda ${s.store} está repetida en «${it.name}»`)
      seen.add(s.store)
    }
  }
}

/**
 * Replaces the items of a guide: deletes the removed ones, updates the kept ones (by id), inserts the new ones and
 * leaves `position` as 1..n in the given order. Positions are written in two passes (kept rows first move out of the
 * way by an offset) so `unique (guide_id, position)` never clashes.
 */
export async function saveGuideItems(client: SupabaseClient, guideId: number, items: GuideItemInput[]): Promise<void> {
  checkStores(items)

  const existing = await client.from('guide_items').select('id').eq('guide_id', guideId)
  fail(existing.error)
  const existingIds = ((existing.data ?? []) as Row[]).map((r) => r.id as number)
  const keptIds = new Set(items.flatMap((i) => (i.id !== undefined ? [i.id] : [])))
  const removed = existingIds.filter((id) => !keptIds.has(id))
  if (removed.length) {
    const del = await client.from('guide_items').delete().eq('guide_id', guideId).in('id', removed)
    fail(del.error)
  }

  // Pass 1: park the kept rows above the final range.
  for (const [i, it] of items.entries()) {
    if (it.id === undefined) continue
    const res = await client
      .from('guide_items')
      .update({ position: POSITION_OFFSET + i + 1 })
      .eq('id', it.id)
    fail(res.error)
  }

  // Pass 2: final positions 1..n. Kept rows are updated, new rows inserted.
  const ids: number[] = []
  const fresh = items.flatMap((it, i) => (it.id === undefined ? [{ it, position: i + 1 }] : []))
  for (const [i, it] of items.entries()) {
    if (it.id === undefined) continue
    const res = await client.from('guide_items').update(itemRow(guideId, i + 1, it)).eq('id', it.id)
    fail(res.error)
  }
  const newIds = new Map<number, number>()
  if (fresh.length) {
    const ins = await client
      .from('guide_items')
      .insert(fresh.map((f) => itemRow(guideId, f.position, f.it)))
      .select('id, position')
    fail(ins.error)
    for (const r of (ins.data ?? []) as Row[]) newIds.set(r.position as number, r.id as number)
  }
  for (const [i, it] of items.entries()) {
    const id = it.id ?? newIds.get(i + 1)
    if (id === undefined) throw new Error('No se pudo guardar la guía')
    ids.push(id)
  }

  await saveStores(client, items, ids)
}

async function saveStores(client: SupabaseClient, items: GuideItemInput[], itemIds: number[]): Promise<void> {
  if (!itemIds.length) return
  const existing = await client.from('guide_item_stores').select('id').in('guide_item_id', itemIds)
  fail(existing.error)
  const keep = new Set(items.flatMap((it) => it.stores.flatMap((s) => (s.id !== undefined ? [s.id] : []))))
  const removed = ((existing.data ?? []) as Row[]).map((r) => r.id as number).filter((id) => !keep.has(id))
  if (removed.length) {
    const del = await client.from('guide_item_stores').delete().in('id', removed)
    fail(del.error)
  }

  const inserts: Record<string, unknown>[] = []
  for (const [i, it] of items.entries()) {
    for (const [j, s] of it.stores.entries()) {
      const row = {
        guide_item_id: itemIds[i],
        store: s.store,
        external_id: s.externalId,
        url: s.url,
        note: s.note || null,
        position: j,
      }
      if (s.id === undefined) {
        inserts.push(row)
      } else {
        const res = await client.from('guide_item_stores').update(row).eq('id', s.id)
        fail(res.error)
      }
    }
  }
  if (inserts.length) {
    const res = await client.from('guide_item_stores').insert(inserts)
    fail(res.error)
  }
}
