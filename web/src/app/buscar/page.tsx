import type { Metadata } from 'next'
import { HomeClient } from '../../components/HomeClient'
import { fetchCoupons } from '../../lib/coupons'
import { homeMetadata } from '../../lib/seo'
import { getSupabase } from '../../lib/supabase'

// Serves `/?q=…` and `/?tag=…` (rewritten here by next.config; the browser URL stays `/?…`).
// Rendered per request for its metadata; the listing itself is fetched on the client as in v1,
// since the filters are read from the URL after hydration.

type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const params = await searchParams
  return homeMetadata({ q: first(params.q), tag: first(params.tag) })
}

/** Resolves to [] on any failure, including missing env vars. */
const loadCoupons = () => Promise.resolve().then(() => fetchCoupons(getSupabase(), 4)).catch(() => [])

export default async function FilteredHomePage() {
  const coupons = await loadCoupons()
  // Events and the calendar come from the static calendar inside HomeClient, as on the home.
  return (
    <HomeClient
      now={new Date().toISOString()}
      coupons={coupons}
      couponStores={coupons.map((c) => c.store)}
    />
  )
}
