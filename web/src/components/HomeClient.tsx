'use client'

import { useEffect, useState } from 'react'
import { useUrlFilters } from '../hooks/useUrlFilters'
import type { DealsFetcher } from '../hooks/useDeals'
import * as api from '../lib/deals'
import { getSupabase } from '../lib/supabase'
import type { Deal, HashtagCount } from '../lib/types'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'
import { Hero } from './Hero'
import { SearchBox } from './SearchBox'
import { TelegramBlock } from './TelegramBlock'

type Props = {
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  fetchDeals?: DealsFetcher
  fetchHashtags?: () => Promise<HashtagCount[]>
  fetchLatestDeal?: () => Promise<Deal | null>
}

// Bound lazily so the Supabase client (and its env vars) is only needed when actually fetching.
// Async so a missing-env throw becomes a rejected promise the UI handles instead of crashing React.
const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)
const defaultFetchHashtags = async () => api.fetchHashtags(getSupabase())
const defaultFetchLatestDeal = async () => api.fetchLatestDeal(getSupabase())

export function HomeClient({
  now,
  fetchDeals = defaultFetchDeals,
  fetchHashtags = defaultFetchHashtags,
  fetchLatestDeal = defaultFetchLatestDeal,
}: Props) {
  const { q, tag, setQ, setTag, clear } = useUrlFilters()
  const [clock, setClock] = useState(() => new Date(now))

  // The page may be a cached (ISR) render; once hydrated, relative times use the visitor's
  // clock. Reading it during render would break hydration, so it is synced after mount.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => setClock(new Date()), [])

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
