import type { Metadata } from 'next'
import { cache } from 'react'
import { DealsClient } from '../../components/DealsClient'
import { fetchDeals, fetchHashtags } from '../../lib/deals'
import { fetchEvents } from '../../lib/events-data'
import { ANNOUNCE_WINDOW_DAYS, nextEvent } from '../../lib/events'
import { parseListingFilters } from '../../lib/filters'
import { fetchPageCopy, type CopyValues } from '../../lib/page-copy'
import { breadcrumbJsonLd, jsonLdScript, listingMetadata } from '../../lib/seo'
import { fetchStores, type StoreStats } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'
import { optional } from '../../lib/optional'
import { parseTagParam, tagPath } from '../../lib/urls'

// Per request: the filters (`?tag=`, `?orden=`, `?tienda=`) are validated here and page 0 is rendered
// already filtered. Searches (`?q=`) are redirected to `/buscar` (see next.config).
type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

// Shared by generateMetadata and the page within one request. All secondary: the listing itself is
// refetched by the client, so /chollos renders (and stays indexable) without any of them.
const loadStores = cache(() => optional('chollos', () => fetchStores(getSupabase())))
const loadCopy = cache(async () => (await optional('chollos', () => fetchPageCopy(getSupabase(), 'static', 'chollos'))) ?? null)

/** Live totals from `web_stores`; `deals` is null when the read failed (marker sentences are dropped). */
function copyValues(stores: StoreStats[] | undefined): CopyValues {
  if (!stores) return { deals: null }
  return {
    deals: stores.reduce((sum, s) => sum + s.deals, 0),
    stores: stores.filter((s) => s.deals > 0).map((s) => s.store),
  }
}

export async function generateMetadata({
  searchParams,
}: { searchParams?: Promise<SearchParams> } = {}): Promise<Metadata> {
  const params = (await searchParams) ?? {}
  const rawTag = first(params.tag)
  const tag = rawTag ? parseTagParam(rawTag) : null
  // A legacy `?tag=` filter stays canonical to its category page.
  if (tag) {
    return listingMetadata({ kind: 'category', slug: tag, path: tagPath(tag), copy: null, values: {}, indexable: true })
  }
  const [stores, copy] = await Promise.all([loadStores(), loadCopy()])
  return listingMetadata({
    kind: 'static',
    slug: 'chollos',
    path: '/chollos',
    copy,
    values: copyValues(stores),
    indexable: true,
  })
}

export default async function DealsPage({ searchParams }: { searchParams?: Promise<SearchParams> } = {}) {
  const params = (await searchParams) ?? {}
  const filters = parseListingFilters((key) => first(params[key]))
  // Each part degrades on its own: without server data the client fetches it.
  const [page, tags, stores, copy, events] = await Promise.all([
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
    loadCopy(),
    optional('chollos', () => fetchEvents(getSupabase())),
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
        intro={{
          copy,
          values: copyValues(stores),
          nextEvent: events ? nextEvent(new Date(), events, ANNOUNCE_WINDOW_DAYS) : null,
        }}
      />
    </>
  )
}
