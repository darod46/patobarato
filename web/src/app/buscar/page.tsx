import type { Metadata } from 'next'
import { HomeClient } from '../../components/HomeClient'
import { homeMetadata } from '../../lib/seo'

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

export default function FilteredHomePage() {
  return <HomeClient now={new Date().toISOString()} />
}
