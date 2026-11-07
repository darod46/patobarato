'use client'

import { useClock } from '../hooks/useClock'
import type { DealsFetcher, InitialDeals } from '../hooks/useDeals'
import { useUrlFilters } from '../hooks/useUrlFilters'
import * as api from '../lib/deals'
import { getSupabase } from '../lib/supabase'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'
import { HeaderSearch } from './HeaderSearch'

type Props = {
  /** Normalized hashtag, fixed for the whole page. */
  tag: string
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  /** Page 0 of this tag without search, rendered on the server. */
  initialDeals: InitialDeals
  initialTags: string[]
  fetchDeals?: DealsFetcher
}

// Bound lazily so the Supabase client is only created when the visitor searches or loads more.
const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)

/** `/chollos/{tag}`: the home listing with the tag fixed; search (`?q=`) works within the tag. */
export function HashtagClient({ tag, now, initialDeals, initialTags, fetchDeals = defaultFetchDeals }: Props) {
  // Only `q` is used from the URL; the tag comes from the path.
  const { q, setQ } = useUrlFilters()
  const clock = useClock(now)

  return (
    <div className="min-h-screen bg-surface font-sans text-ink">
      <Header search={<HeaderSearch value={q} onChange={setQ} />} />
      <main className="mx-auto max-w-[1200px] px-4 pt-32 pb-12 md:px-8 md:pt-24 md:pb-16">
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">Chollos de #{tag}</h1>
        <p className="mt-1.5 mb-5 text-muted">Se actualiza automáticamente</p>
        <DealFeed
          q={q}
          tag={tag}
          onClear={() => setQ('')}
          fetchDeals={fetchDeals}
          initialDeals={initialDeals}
          initialTags={initialTags}
          now={clock}
        />
      </main>
      <Footer year={new Date(now).getUTCFullYear()} />
    </div>
  )
}
