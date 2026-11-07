import type { Metadata } from 'next'
import { DealsClient } from '../../components/DealsClient'
import { fetchStores } from '../../lib/stores-data'
import { dealsMetadata } from '../../lib/seo'
import { getSupabase } from '../../lib/supabase'

// Serves `/?q=…`, `/?tag=…` and `/chollos?q=…` (rewritten here by next.config; the browser URL stays the original).
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
  const stores = await loadStores()
  return dealsMetadata({ q: first(params.q), tag: first(params.tag), stores })
}

/** Resolves to [] on any failure, including missing env vars. */
const loadStores = () => Promise.resolve().then(() => fetchStores(getSupabase())).catch(() => [])

export default async function FilteredDealsPage() {
  const stores = await loadStores()
  return <DealsClient now={new Date().toISOString()} stores={stores} />
}
