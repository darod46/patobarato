import type { Metadata } from 'next'
import { DealsClient } from '../../components/DealsClient'
import { fetchDeals, fetchHashtags } from '../../lib/deals'
import { breadcrumbJsonLd, dealsMetadata, jsonLdScript } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'

// Listings are regenerated at most every 60 s. Requests with `?q=`, `?tag=`, `?orden=` or `?tienda=`
// are rewritten to `/buscar` (see next.config), so this page never depends on the query string.
export const revalidate = 60

/** Resolves to undefined on any failure (including missing env vars, which throw synchronously). */
const optional = <T,>(load: () => Promise<T>) => Promise.resolve().then(load).catch(() => undefined)

const loadStores = () => optional(() => fetchStores(getSupabase()))

export async function generateMetadata(): Promise<Metadata> {
  return dealsMetadata({ stores: (await loadStores()) ?? [] })
}

export default async function DealsPage() {
  // Each part degrades on its own: without server data the client fetches it.
  const [page, tags, stores] = await Promise.all([
    optional(() => fetchDeals(getSupabase(), { page: 0 })),
    optional(() => fetchHashtags(getSupabase(), 12)),
    loadStores(),
  ])
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Chollos', path: '/chollos' },
  ])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <DealsClient
        now={new Date().toISOString()}
        initialDeals={page && { q: '', tag: null, sort: 'recientes', ...page }}
        initialTags={tags?.map((h) => h.tag)}
        stores={stores ?? []}
      />
    </>
  )
}
