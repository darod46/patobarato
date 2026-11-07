'use client'

import { useClock } from '../hooks/useClock'
import * as api from '../lib/deals'
import { storeNames } from '../lib/stores'
import type { StoreStats } from '../lib/stores-data'
import { getSupabase } from '../lib/supabase'
import type { Coupon, Deal, SiteEvent } from '../lib/types'
import { AboutBlock } from './AboutBlock'
import { AnnouncementBar } from './AnnouncementBar'
import { CouponsBlock } from './CouponsBlock'
import { DealCarousel } from './DealCarousel'
import { EventsBlock } from './EventsBlock'
import { Footer } from './Footer'
import { Header } from './Header'
import { StoresBlock } from './StoresBlock'
import { Hero, type HeroHighlights } from './Hero'
import { HowItWorks } from './HowItWorks'
import { TelegramBlock } from './TelegramBlock'

type Props = {
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  /** Newest deals (page 0 rendered on the server); the carousel shows the first few. Empty when the fetch failed. */
  deals?: Deal[]
  fetchLatestDeal?: () => Promise<Deal | null>
  /** Facts for the hero badges; computed on the server from the first page. */
  highlights?: HeroHighlights
  /** Valid coupons for the home block (at most the first few). */
  coupons?: Coupon[]
  /** Stores with active deals or coupons (hero copy, stores block, chips, affiliate notice). */
  stores?: StoreStats[]
  /** Event for the announcement bar (within the window); no bar when omitted or null. */
  event?: SiteEvent | null
  /** Calendar list; the events block is omitted when it is empty or omitted. */
  upcoming?: SiteEvent[]
  /** Event in progress, which the hero's primary button links to. */
  activeEvent?: SiteEvent | null
  /** Newest publication date for the announcement bar; null when unknown. */
  latestPublishedAt?: string | null
}

// Bound lazily so the Supabase client (and its env vars) is only needed when actually fetching.
// Async so a missing-env throw becomes a rejected promise the UI handles instead of crashing React.
const defaultFetchLatestDeal = async () => api.fetchLatestDeal(getSupabase())
const NO_HIGHLIGHTS: HeroHighlights = { topDiscountPct: null, topDiscountTitle: null, latestCouponTitle: null, hasLowest: false }

export function HomeClient({
  now,
  deals = [],
  fetchLatestDeal = defaultFetchLatestDeal,
  highlights = NO_HIGHLIGHTS,
  coupons = [],
  stores = [],
  event = null,
  upcoming = [],
  activeEvent = null,
  latestPublishedAt = null,
}: Props) {
  const clock = useClock(now)
  const renderTime = new Date(now)

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header />
      <main className="pt-[60px] md:pt-[72px]">
        <AnnouncementBar
          event={event}
          second={event && upcoming[0]?.id === event.id ? (upcoming[1] ?? null) : null}
          latestPublishedAt={latestPublishedAt}
          now={renderTime}
        />
        <Hero highlights={highlights} storeNames={storeNames(stores.map((s) => s.store))} activeEvent={activeEvent} />
        <StoresBlock stores={stores} />
        <section id="chollos" className="mx-auto max-w-[1200px] scroll-mt-32 px-4 pt-8 pb-12 md:px-8 md:pt-12">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">Chollos de hoy</h2>
          <p className="mt-1.5 mb-5 text-muted">Se actualiza automáticamente</p>
          <DealCarousel deals={deals} now={clock} />
        </section>
        <CouponsBlock coupons={coupons} />
        <HowItWorks />
        {upcoming.length > 0 && <EventsBlock next={upcoming[0]} upcoming={upcoming} now={renderTime} />}
        <AboutBlock />
        <TelegramBlock fetchLatestDeal={fetchLatestDeal} />
      </main>
      <Footer year={renderTime.getUTCFullYear()} stores={stores.map((s) => s.store)} />
    </div>
  )
}
