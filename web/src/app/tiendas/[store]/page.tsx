import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import { StoreClient } from '../../../components/StoreClient'
import { fetchCoupons } from '../../../lib/coupons'
import { fetchDeals, fetchHashtags } from '../../../lib/deals'
import { breadcrumbJsonLd, jsonLdScript, storeMetadata } from '../../../lib/seo'
import { storeFromSlug, storeInfo } from '../../../lib/stores'
import { fetchStores } from '../../../lib/stores-data'
import { getSupabase } from '../../../lib/supabase'

// Upper bound of coupons fetched for one store (more than any store will have valid at once).
const MAX_COUPONS = 50

// Listings are regenerated at most every 60 s.
export const revalidate = 60

// Nothing is prerendered at build time; an empty list still enables on-demand ISR caching.
export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ store: string }> }

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

// Shared by generateMetadata and the page within one request. Null means 404 (unknown store).
// Every data part is optional: the page still renders without it, and the client fetches the listing.
const loadStore = cache(async (slug: string) => {
  const store = storeFromSlug(slug)
  if (!store) return null
  const [page, stores, coupons, tags] = await Promise.all([
    optional(() => fetchDeals(getSupabase(), { page: 0, store })),
    optional(() => fetchStores(getSupabase())),
    optional(() => fetchCoupons(getSupabase(), MAX_COUPONS, store)),
    optional(() => fetchHashtags(getSupabase(), 12)),
  ])
  const deals = stores?.find((s) => s.store === store)?.deals ?? page?.deals.length ?? 0
  return { store, page, stores: stores ?? [], coupons: coupons ?? [], tags: tags ?? [], deals }
})

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await loadStore((await params).store)
  if (!data) notFound()
  return storeMetadata(data.store, data.deals)
}

export default async function StorePage({ params }: Props) {
  const data = await loadStore((await params).store)
  if (!data) notFound()
  const { slug, name } = storeInfo(data.store)
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
        initialDeals={data.page && { q: '', tag: null, store: data.store, sort: 'recientes', ...data.page }}
        initialTags={data.tags.map((h) => h.tag)}
        stores={data.stores}
        coupons={data.coupons}
      />
    </>
  )
}
