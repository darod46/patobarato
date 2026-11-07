import type { Metadata } from 'next'
import { DealsClient } from '../../components/DealsClient'
import { fetchDeals, fetchHashtags } from '../../lib/deals'
import { parseListingFilters } from '../../lib/filters'
import { breadcrumbJsonLd, dealsMetadata, jsonLdScript } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'
import { optional } from '../../lib/optional'

// Per request: the filters (`?tag=`, `?orden=`, `?tienda=`) are validated here and page 0 is rendered
// already filtered. Searches (`?q=`) are redirected to `/buscar` (see next.config).
type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

const loadStores = () => optional('chollos', () => fetchStores(getSupabase()))

export async function generateMetadata({
  searchParams,
}: { searchParams?: Promise<SearchParams> } = {}): Promise<Metadata> {
  const params = (await searchParams) ?? {}
  return dealsMetadata({ tag: first(params.tag), stores: (await loadStores()) ?? [] })
}

export default async function DealsPage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const params = (await searchParams) ?? {}
  const filters = parseListingFilters((key) => first(params[key]))
  // Each part degrades on its own: without server data the client fetches it.
  const [page, tags, stores] = await Promise.all([
    optional('chollos', () =>
      fetchDeals(getSupabase(), {
        page: 0,
        tag: filters.tag ?? undefined,
        store: filters.store ?? undefined,
        sort: filters.sort,
      }),
    ),
    optional('chollos', () => fetchHashtags(getSupabase(), 12)),
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
        initialDeals={page && { q: '', ...filters, ...page }}
        initialTags={tags?.map((h) => h.tag)}
        stores={stores ?? []}
      />
    </>
  )
}
