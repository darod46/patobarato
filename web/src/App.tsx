import { useState } from 'react'
import { DealFeed } from './components/DealFeed'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { Hero } from './components/Hero'
import { SearchBox } from './components/SearchBox'
import { TelegramBlock } from './components/TelegramBlock'
import { useUrlFilters } from './hooks/useUrlFilters'
import type { DealsFetcher } from './hooks/useDeals'
import * as api from './lib/deals'
import { getSupabase } from './lib/supabase'
import type { Deal, HashtagCount } from './lib/types'

type Props = {
  fetchDeals?: DealsFetcher
  fetchHashtags?: () => Promise<HashtagCount[]>
  fetchLatestDeal?: () => Promise<Deal | null>
  now?: Date
}

// Bound lazily so the Supabase client (and its env vars) is only needed when actually fetching.
const defaultFetchDeals: DealsFetcher = (params) => api.fetchDeals(getSupabase(), params)
const defaultFetchHashtags = () => api.fetchHashtags(getSupabase())
const defaultFetchLatestDeal = () => api.fetchLatestDeal(getSupabase())

export default function App({
  fetchDeals = defaultFetchDeals,
  fetchHashtags = defaultFetchHashtags,
  fetchLatestDeal = defaultFetchLatestDeal,
  now,
}: Props) {
  const { q, tag, setQ, setTag, clear } = useUrlFilters()
  const [clock] = useState(() => now ?? new Date())

  return (
    <div className="min-h-screen bg-surface font-sans text-carbon">
      <Header search={<SearchBox value={q} onChange={setQ} />} />
      <main className="pt-28 md:pt-16">
        <Hero />
        <section id="chollos" className="mx-auto max-w-[1280px] scroll-mt-32 px-4 py-12 md:px-8">
          <h2 className="mb-6 text-3xl font-bold">Chollos</h2>
          <DealFeed
            q={q}
            tag={tag}
            onTag={setTag}
            onClear={clear}
            fetchDeals={fetchDeals}
            fetchHashtags={fetchHashtags}
            now={clock}
          />
        </section>
        <TelegramBlock fetchLatestDeal={fetchLatestDeal} />
      </main>
      <Footer />
    </div>
  )
}
