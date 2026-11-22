import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { StoreClient } from '../../../components/StoreClient'
import { MAX_STORE_COUPONS, fetchCoupons } from '../../../lib/coupons'
import { fetchDeals, fetchHashtags } from '../../../lib/deals'
import { fetchEvents } from '../../../lib/events-data'
import { ANNOUNCE_WINDOW_DAYS, nextEvent } from '../../../lib/events'
import { fetchPageCopy } from '../../../lib/page-copy'
import { MIN_INDEXABLE_DEALS, breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../../lib/seo'
import { storeFromSlug, storeInfo } from '../../../lib/stores'
import { fetchStores } from '../../../lib/stores-data'
import { getSupabase } from '../../../lib/supabase'
import { optional } from '../../../lib/optional'

// Listings are regenerated at most every 60 s.
export const revalidate = 60

// Nothing is prerendered at build time; an empty list still enables on-demand ISR caching.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ store: string }> }

// Shared by generateMetadata and the page within one request. Null means 404 (unknown store).
// The deals are the primary read: a failure throws (Next keeps the last ISR version), never noindex.
// Stats, coupons, chips and copy are secondary and degrade on their own.
const loadStore = cache(async (slug: string) => {
  const store = storeFromSlug(slug)
  if (!store) return null
  const client = getSupabase()
  const [page, stores, coupons, tags, copy] = await Promise.all([
    fetchDeals(client, { page: 0, store }),
    optional('tienda', () => fetchStores(client)),
    optional('tienda', () => fetchCoupons(client, MAX_STORE_COUPONS, store)),
    optional('tienda', () => fetchHashtags(client, 12)),
    optional('tienda', () => fetchPageCopy(client, 'store', store)),
  ])
  // Live count from `web_stores`; without its row (read failed, or no deals nor coupons) use the deals loaded.
  const live = stores?.find((s) => s.store === store)?.deals
  const deals = live ?? page.deals.length
  // The copy only states a count that is exact, and 0 is no value: its "{deals}" sentence is dropped.
  const shown = live ?? (page.hasMore ? null : page.deals.length)
  const values = { deals: shown !== null && shown > 0 ? shown : null }
  return { store, page, stores: stores ?? [], coupons, tags: tags ?? [], deals, values, copy: copy ?? null }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadStore((await params).store)
  if (!data) notFound()
  const { name, slug } = storeInfo(data.store)
  return listingMetadata({
    kind: 'store',
    slug: data.store,
    path: `/tiendas/${slug}`,
    copy: data.copy,
    values: data.values,
    // Thin only when the DB answered with fewer than 3 deals and there is no editorial copy (spec §6).
    indexable: data.copy !== null || data.deals >= MIN_INDEXABLE_DEALS,
    fallbackDescription: `Los últimos chollos y cupones de ${name} cazados por PatoBarato, con su precio, el precio anterior y el cupón si lo hay.`,
  })
}

export default async function StorePage({ params }: Props) {
  const data = await loadStore((await params).store)
  if (!data) notFound()
  const { slug, name } = storeInfo(data.store)
  // The next event is optional: the store page still renders if it fails.
  const events = await optional('tienda', () => fetchEvents(getSupabase()))
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Tiendas', path: '/tiendas' },
    { name, path: `/tiendas/${slug}` },
  ])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <StoreClient
        store={data.store}
        now={new Date().toISOString()}
        initialDeals={{ q: '', tag: null, store: data.store, sort: 'recientes', ...data.page }}
        initialTags={data.tags.map((h) => h.tag)}
        stores={data.stores}
        coupons={data.coupons}
        intro={{
          copy: data.copy,
          values: data.values,
          nextEvent: events ? nextEvent(new Date(), events, ANNOUNCE_WINDOW_DAYS) : null,
        }}
      />
    </>
  )
}
