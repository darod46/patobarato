'use client'

import { useClock } from '../hooks/useClock'
import { useUrlFilters } from '../hooks/useUrlFilters'
import type { DealsFetcher, InitialDeals } from '../hooks/useDeals'
import * as api from '../lib/deals'
import { getSupabase } from '../lib/supabase'
import type { Deal, HashtagCount } from '../lib/types'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'
import { Hero, type HeroHighlights } from './Hero'
import { SearchBox } from './SearchBox'
import { TelegramBlock } from './TelegramBlock'

type Props = {
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  /** Unfiltered page 0 rendered on the server; the URL filters are only known after hydration. */
  initialDeals?: InitialDeals
  /** Top hashtags rendered on the server. */
  initialTags?: string[]
  fetchDeals?: DealsFetcher
  fetchHashtags?: () => Promise<HashtagCount[]>
  fetchLatestDeal?: () => Promise<Deal | null>
  /** Facts for the hero badges; computed on the server from the first page. */
  highlights?: HeroHighlights
}

// Bound lazily so the Supabase client (and its env vars) is only needed when actually fetching.
// Async so a missing-env throw becomes a rejected promise the UI handles instead of crashing React.
const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)
const defaultFetchHashtags = async () => api.fetchHashtags(getSupabase())
const defaultFetchLatestDeal = async () => api.fetchLatestDeal(getSupabase())
const NO_HIGHLIGHTS: HeroHighlights = { topDiscountPct: null, topDiscountTitle: null, latestCouponTitle: null, hasLowest: false }

export function HomeClient({
  now,
  initialDeals,
  initialTags,
  fetchDeals = defaultFetchDeals,
  fetchHashtags = defaultFetchHashtags,
  fetchLatestDeal = defaultFetchLatestDeal,
  highlights = NO_HIGHLIGHTS,
}: Props) {
  // Chips are links to /chollos/{tag}; a legacy `/?tag=` still filters here and marks its chip.
  const { q, tag, sort, setQ, setSort, clear } = useUrlFilters()
  const clock = useClock(now)

  return (
    <div className="min-h-screen bg-surface font-sans text-carbon">
      <Header search={<SearchBox value={q} onChange={setQ} />} />
      <main className="pt-28 md:pt-16">
        <Hero highlights={highlights} />
        <section id="chollos" className="mx-auto max-w-[1280px] scroll-mt-32 px-4 pt-6 pb-12 md:px-8 md:pt-12">
          <h2 className="mb-3 text-2xl font-bold md:mb-6 md:text-3xl">Chollos</h2>
          <DealFeed
            q={q}
            tag={tag}
            sort={sort}
            onSort={setSort}
            onClear={clear}
            fetchDeals={fetchDeals}
            fetchHashtags={fetchHashtags}
            initialDeals={initialDeals}
            initialTags={initialTags}
            now={clock}
          />
        </section>
        <TelegramBlock fetchLatestDeal={fetchLatestDeal} />
      </main>
      <Footer year={new Date(now).getUTCFullYear()} />
    </div>
  )
}
