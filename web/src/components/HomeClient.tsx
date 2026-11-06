'use client'

import type { SiteEvent } from '../content/events'
import { useClock } from '../hooks/useClock'
import { useUrlFilters } from '../hooks/useUrlFilters'
import type { DealsFetcher, InitialDeals } from '../hooks/useDeals'
import * as api from '../lib/deals'
import { getSupabase } from '../lib/supabase'
import type { Coupon, Deal, HashtagCount } from '../lib/types'
import { AboutBlock } from './AboutBlock'
import { AnnouncementBar } from './AnnouncementBar'
import { CouponsBlock } from './CouponsBlock'
import { DealFeed } from './DealFeed'
import { EventsBlock } from './EventsBlock'
import { Footer } from './Footer'
import { Header } from './Header'
import { Hero, type HeroHighlights } from './Hero'
import { HowItWorks } from './HowItWorks'
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
  /** Valid coupons for the home block (at most the first few). */
  coupons?: Coupon[]
  /** Store ids with valid coupons (for the title and the affiliate notice). */
  couponStores?: string[]
  /** Next shopping event and the following ones, from the static calendar. */
  event?: SiteEvent | null
  upcoming?: SiteEvent[]
  /** Newest publication date for the announcement bar; null when unknown. */
  latestPublishedAt?: string | null
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
  coupons = [],
  couponStores = [],
  event = null,
  upcoming = [],
  latestPublishedAt = null,
}: Props) {
  // Chips are links to /chollos/{tag}; a legacy `/?tag=` still filters here and marks its chip.
  const { q, tag, sort, setQ, setSort, clear } = useUrlFilters()
  const clock = useClock(now)
  const renderTime = new Date(now)

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header search={<SearchBox value={q} onChange={setQ} />} />
      <main className="pt-[118px] md:pt-[72px]">
        <AnnouncementBar event={event} latestPublishedAt={latestPublishedAt} now={renderTime} />
        <Hero highlights={highlights} />
        <section id="chollos" className="mx-auto max-w-[1200px] scroll-mt-32 px-4 pt-8 pb-12 md:px-8 md:pt-12">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">Chollos de hoy</h2>
          <p className="mt-1.5 mb-5 text-muted">Se actualiza automáticamente</p>
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
        <CouponsBlock coupons={coupons} />
        <HowItWorks />
        <EventsBlock next={event} upcoming={upcoming} now={renderTime} />
        <AboutBlock />
        <TelegramBlock fetchLatestDeal={fetchLatestDeal} />
      </main>
      <Footer year={renderTime.getUTCFullYear()} couponStores={couponStores} />
    </div>
  )
}
