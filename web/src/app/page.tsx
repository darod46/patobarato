import type { Metadata } from 'next'
import { HomeClient } from '../components/HomeClient'
import { fetchCoupons } from '../lib/coupons'
import { fetchDeals, fetchLatestDeal } from '../lib/deals'
import { ANNOUNCE_WINDOW_DAYS, nextEvent, upcomingEvents } from '../lib/events'
import { heroHighlights } from '../lib/highlights'
import { fetchStores } from '../lib/stores-data'
import { homeMetadata, jsonLdScript, siteJsonLd } from '../lib/seo'
import { getSupabase } from '../lib/supabase'
import { optional } from '../lib/optional'

// Listings are regenerated at most every 60 s. Requests with `?q=`, `?tag=`, `?orden=` or `?tienda=` are
// redirected (308) to `/buscar` or `/chollos` (see next.config), so this page never depends on the query string.
export const revalidate = 60


const loadCoupons = () => optional('home', () => fetchCoupons(getSupabase(), 4))
const loadStores = () => optional('home', () => fetchStores(getSupabase()))

export async function generateMetadata(): Promise<Metadata> {
  const stores = await loadStores()
  return homeMetadata({ stores: stores ?? [] })
}

export default async function HomePage() {
  const now = new Date()
  // Each part degrades on its own: without deals the carousel shows an honest fallback.
  const [page, coupons, stores, latest] = await Promise.all([
    optional('home', () => fetchDeals(getSupabase(), { page: 0 })),
    loadCoupons(),
    loadStores(),
    optional('home', () => fetchLatestDeal(getSupabase())),
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
