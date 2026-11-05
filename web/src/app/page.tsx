import type { Metadata } from 'next'
import { HomeClient } from '../components/HomeClient'
import { fetchDeals, fetchHashtags } from '../lib/deals'
import { homeMetadata } from '../lib/seo'
import { getSupabase } from '../lib/supabase'

// Listings are regenerated at most every 60 s. Requests with `?q=` or `?tag=` are rewritten to
// `/buscar` (see next.config), so this page never depends on the query string.
export const revalidate = 60

export const metadata: Metadata = homeMetadata({})

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

export default async function HomePage() {
  // Each part degrades on its own: without server data the client fetches it as in v1.
  const [page, tags] = await Promise.all([
    optional(() => fetchDeals(getSupabase(), { page: 0 })),
    optional(() => fetchHashtags(getSupabase(), 12)),
  ])
  return (
    <HomeClient
      now={new Date().toISOString()}
      initialDeals={page && { q: '', tag: null, ...page }}
      initialTags={tags?.map((h) => h.tag)}
    />
  )
}
