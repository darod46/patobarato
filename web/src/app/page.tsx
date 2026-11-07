import type { Metadata } from 'next'
import { HomeClient } from '../components/HomeClient'
import { fetchCoupons } from '../lib/coupons'
import { fetchDeals, fetchLatestDeal } from '../lib/deals'
import { ANNOUNCE_WINDOW_DAYS, nextEvent, upcomingEvents } from '../lib/events'
import { heroHighlights } from '../lib/highlights'
import { fetchStores } from '../lib/stores-data'
import { homeMetadata, jsonLdScript, siteJsonLd } from '../lib/seo'
import { getSupabase } from '../lib/supabase'

// Listings are regenerated at most every 60 s. Requests with `?q=`, `?tag=`, `?orden=` or `?tienda=` are
// rewritten to `/buscar` (see next.config), so this page never depends on the query string.
export const revalidate = 60

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

const loadCoupons = () => optional(() => fetchCoupons(getSupabase(), 4))
const loadStores = () => optional(() => fetchStores(getSupabase()))

export async function generateMetadata(): Promise<Metadata> {
  const stores = await loadStores()
  return homeMetadata({ stores: stores ?? [] })
}

export default async function HomePage() {
  const now = new Date()
  // Each part degrades on its own: without deals the carousel shows an honest fallback.
  const [page, coupons, stores, latest] = await Promise.all([
    optional(() => fetchDeals(getSupabase(), { page: 0 })),
    loadCoupons(),
    loadStores(),
    optional(() => fetchLatestDeal(getSupabase())),
  ])
  const couponList = coupons ?? []
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(siteJsonLd())} />
      <HomeClient
        now={now.toISOString()}
        deals={page?.deals.slice(0, 5)}
        highlights={heroHighlights(page?.deals ?? [], couponList)}
        coupons={couponList}
        stores={stores ?? []}
        event={nextEvent(now, undefined, ANNOUNCE_WINDOW_DAYS)}
        upcoming={upcomingEvents(now, 4)}
        latestPublishedAt={latest?.publishedAt ?? null}
      />
    </>
  )
}
