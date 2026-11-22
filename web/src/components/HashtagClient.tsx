'use client'

import type { ReactNode } from 'react'
import { useClock } from '../hooks/useClock'
import type { DealsFetcher, InitialDeals } from '../hooks/useDeals'
import * as api from '../lib/deals'
import { getSupabase } from '../lib/supabase'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'

type Props = {
  /** Normalized hashtag, fixed for the whole page. */
  tag: string
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  /** Page 0 of this tag, rendered on the server. */
  initialDeals: InitialDeals
  initialTags: string[]
  fetchDeals?: DealsFetcher
  /** Server-rendered heading (`<PageIntro>`) in place of the plain `<h1>`; keeps Markdown out of the client bundle. */
  intro?: ReactNode
  /** Server-rendered FAQ (`<PageFaq>`), shown below the listing. */
  faq?: ReactNode
}

// Bound lazily so the Supabase client is only created when the visitor searches or loads more.
const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)

// With nothing left to remove, the empty state sends the visitor to the whole listing.
const allDeals = () => window.location.assign('/chollos')

/** `/chollos/{tag}`: the listing with the tag fixed. */
export function HashtagClient({ tag, now, initialDeals, initialTags, fetchDeals = defaultFetchDeals, intro, faq }: Props) {
  const clock = useClock(now)

  return (
    <div className="min-h-screen bg-surface font-sans text-ink">
      <Header />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-12 md:px-8 md:pt-24 md:pb-16">
        {intro ? (
          // The editorial intro replaces the plain caption under the heading.
          <div className="mb-5">{intro}</div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">Chollos de #{tag}</h1>
            <p className="mt-1.5 mb-5 text-muted">Se actualiza automáticamente</p>
          </>
        )}
        <DealFeed
          q=""
          tag={tag}
          onClear={allDeals}
          fetchDeals={fetchDeals}
          initialDeals={initialDeals}
          initialTags={initialTags}
          now={clock}
        />
        {faq}
      </main>
      <Footer year={new Date(now).getUTCFullYear()} />
    </div>
  )
}
