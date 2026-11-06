import type { Metadata } from 'next'
import { HomeClient } from '../components/HomeClient'
import { fetchCoupons } from '../lib/coupons'
import { fetchDeals, fetchHashtags, fetchLatestDeal } from '../lib/deals'
import { ANNOUNCE_WINDOW_DAYS, nextEvent, upcomingEvents } from '../lib/events'
import { heroHighlights } from '../lib/highlights'
import { homeMetadata, jsonLdScript, siteJsonLd } from '../lib/seo'
import { getSupabase } from '../lib/supabase'

// Listings are regenerated at most every 60 s. Requests with `?q=`, `?tag=` or `?orden=` are
// rewritten to `/buscar` (see next.config), so this page never depends on the query string.
export const revalidate = 60

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

const loadCoupons = () => optional(() => fetchCoupons(getSupabase(), 4))

export async function generateMetadata(): Promise<Metadata> {
  const coupons = await loadCoupons()
  return homeMetadata({ couponStores: (coupons ?? []).map((c) => c.store) })
}

export default async function HomePage() {
  const now = new Date()
  // Each part degrades on its own: without server data the client fetches it as in v1.
  const [page, tags, coupons, latest] = await Promise.all([
    optional(() => fetchDeals(getSupabase(), { page: 0 })),
    optional(() => fetchHashtags(getSupabase(), 12)),
    loadCoupons(),
    optional(() => fetchLatestDeal(getSupabase())),
  ])
  const couponList = coupons ?? []
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(siteJsonLd())} />
      <HomeClient
        now={now.toISOString()}
        initialDeals={page && { q: '', tag: null, sort: 'recientes', ...page }}
        initialTags={tags?.map((h) => h.tag)}
        highlights={heroHighlights(page?.deals ?? [], couponList)}
        coupons={couponList}
        couponStores={couponList.map((c) => c.store)}
        event={nextEvent(now, undefined, ANNOUNCE_WINDOW_DAYS)}
        upcoming={upcomingEvents(now, 4)}
        latestPublishedAt={latest?.publishedAt ?? null}
      />
    </>
  )
}
