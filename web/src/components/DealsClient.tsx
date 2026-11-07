'use client'

import { useClock } from '../hooks/useClock'
import type { DealsFetcher, InitialDeals } from '../hooks/useDeals'
import { useUrlFilters } from '../hooks/useUrlFilters'
import * as api from '../lib/deals'
import type { StoreStats } from '../lib/stores-data'
import { getSupabase } from '../lib/supabase'
import type { HashtagCount } from '../lib/types'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'

type Props = {
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  /** Page 0 rendered on the server for the URL filters; the client does not refetch it when they match. */
  initialDeals?: InitialDeals
  /** Top hashtags rendered on the server. */
  initialTags?: string[]
  fetchDeals?: DealsFetcher
  fetchHashtags?: () => Promise<HashtagCount[]>
  /** Stores with active deals or coupons (store chips, affiliate notice). */
  stores?: StoreStats[]
}

// Bound lazily so the Supabase client (and its env vars) is only needed when actually fetching.
// Async so a missing-env throw becomes a rejected promise the UI handles instead of crashing React.
const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)
const defaultFetchHashtags = async () => api.fetchHashtags(getSupabase())

function searchOf({ tag, store, sort }: InitialDeals) {
  const params = new URLSearchParams()
  if (tag) params.set('tag', tag)
  if (store) params.set('tienda', store)
  if (sort && sort !== 'recientes') params.set('orden', sort)
  return params.toString()
}

/** `/chollos`: the full listing with sort and chips. */
export function DealsClient({
  now,
  initialDeals,
  initialTags,
  fetchDeals = defaultFetchDeals,
  fetchHashtags = defaultFetchHashtags,
  stores = [],
}: Props) {
  // Chips are links to /chollos/{tag}; a legacy `?tag=` still filters here and marks its chip.
  // The server rendered page 0 for these filters, so the hydration render must use them too.
  const { tag, store, sort, setSort, setStore, clear } = useUrlFilters(initialDeals ? searchOf(initialDeals) : '')
  const clock = useClock(now)

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-12 md:px-8 md:pt-24 md:pb-16">
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">Chollos de hoy</h1>
        <p className="mt-1.5 mb-5 text-muted">Se actualiza automáticamente</p>
        <DealFeed
          q=""
          tag={tag}
          store={store}
          stores={stores}
          onStore={setStore}
          sort={sort}
          onSort={setSort}
          onClear={clear}
          fetchDeals={fetchDeals}
          fetchHashtags={fetchHashtags}
          initialDeals={initialDeals}
          initialTags={initialTags}
          now={clock}
        />
      </main>
      <Footer year={new Date(now).getUTCFullYear()} stores={stores.map((s) => s.store)} />
    </div>
  )
}
