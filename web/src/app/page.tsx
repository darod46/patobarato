import type { Metadata } from 'next'
import { HomeClient } from '../components/HomeClient'
import { fetchCoupons } from '../lib/coupons'
import { fetchDeals, fetchLatestDeal } from '../lib/deals'
import { activeEvent, ANNOUNCE_WINDOW_DAYS, nextEvent, upcomingEvents } from '../lib/events'
import { fetchEvents } from '../lib/events-data'
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
  const [page, coupons, stores, latest, events] = await Promise.all([
    optional('home', () => fetchDeals(getSupabase(), { page: 0 })),
    loadCoupons(),
    loadStores(),
    optional('home', () => fetchLatestDeal(getSupabase())),
    optional('home-events', () => fetchEvents(getSupabase())),
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
        event={events ? nextEvent(now, events, ANNOUNCE_WINDOW_DAYS) : null}
        upcoming={events ? upcomingEvents(now, 4, events) : []}
        activeEvent={events ? activeEvent(now, events) : null}
        latestPublishedAt={latest?.publishedAt ?? null}
      />
    </>
  )
}
