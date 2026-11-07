import type { Metadata } from 'next'
import { SearchClient } from '../../components/SearchClient'
import { fetchHashtags } from '../../lib/deals'
import { optional } from '../../lib/optional'
import { breadcrumbJsonLd, jsonLdScript, searchMetadata } from '../../lib/seo'
import { fetchStores } from '../../lib/stores-data'
import { getSupabase } from '../../lib/supabase'

// Per request (reads `?q=`): the results themselves are fetched on the client.
type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const params = await searchParams
  return searchMetadata(first(params.q) ?? null)
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const initialQ = first(params.q) ?? ''
  const [tags, stores] = await Promise.all([
    optional('buscar', () => fetchHashtags(getSupabase(), 12)),
    optional('buscar', () => fetchStores(getSupabase())),
  ])
  const crumbs = breadcrumbJsonLd([
    { name: 'Inicio', path: '/' },
    { name: 'Buscar', path: '/buscar' },
  ])
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLdScript(crumbs)} />
      <SearchClient
        now={new Date().toISOString()}
        initialQ={initialQ}
        tags={tags?.map((h) => h.tag) ?? []}
        stores={stores ?? []}
      />
    </>
  )
}
