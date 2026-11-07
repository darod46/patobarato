'use client'

import { useClock } from '../hooks/useClock'
import type { DealsFetcher, InitialDeals } from '../hooks/useDeals'
import { useUrlFilters } from '../hooks/useUrlFilters'
import { MAX_STORE_COUPONS } from '../lib/coupons'
import * as api from '../lib/deals'
import { storeInfo } from '../lib/stores'
import type { StoreStats } from '../lib/stores-data'
import { countLabel } from '../lib/text'
import type { Coupon } from '../lib/types'
import { getSupabase } from '../lib/supabase'
import { CouponsBlock } from './CouponsBlock'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'
import { HeaderSearch } from './HeaderSearch'

type Props = {
  /** Store id, fixed for the whole page. */
  store: string
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  /** Page 0 of this store without search, rendered on the server; the client fetches it when absent. */
  initialDeals?: InitialDeals
  initialTags: string[]
  /** Stores with data: the header counts come from this store's row, the footer names them. */
  stores: StoreStats[]
  /** Valid coupons of this store; undefined when they could not be loaded. */
  coupons: Coupon[] | undefined
  fetchDeals?: DealsFetcher
}

// Bound lazily so the Supabase client is only created when the visitor searches or loads more.
const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)

/** `/tiendas/{tienda}`: the home listing with the store fixed (`?tienda=` is ignored); search works within it. */
export function StoreClient({ store, now, initialDeals, initialTags, stores, coupons, fetchDeals = defaultFetchDeals }: Props) {
  // Only `q` and the sort are used from the URL; the store comes from the path.
  const { q, setQ, sort, setSort } = useUrlFilters()
  const clock = useClock(now)
  const stats = stores.find((s) => s.store === store)
  // Without the stats row never claim 0: use what the page itself knows, or show the name alone.
  // A full list may be truncated, so its length is only a count when below the fetch limit.
  const couponCount = stats?.coupons ?? (coupons && coupons.length < MAX_STORE_COUPONS ? coupons.length : null)
  const dealCount = stats?.deals ?? (initialDeals && !initialDeals.hasMore ? initialDeals.deals.length : null)
  const summary = [
    storeInfo(store).short,
    ...(dealCount !== null ? [countLabel(dealCount, 'chollo', 'chollos')] : []),
    ...(couponCount !== null ? [countLabel(couponCount, 'cupón', 'cupones')] : []),
  ].join(' · ')

  return (
    <div className="min-h-screen bg-surface font-sans text-ink">
      <Header search={<HeaderSearch value={q} onChange={setQ} />} />
      <main>
        <div className="mx-auto max-w-[1200px] px-4 pt-32 md:px-8 md:pt-24">
        <h1 className="font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">Chollos de {storeInfo(store).name}</h1>
        <p className="mt-1.5 mb-5 text-muted">{summary}</p>
        </div>
        <CouponsBlock coupons={coupons ?? []} />
        <div className="mx-auto max-w-[1200px] px-4 pb-12 md:px-8 md:pb-16">
        <DealFeed
          q={q}
          tag={null}
          store={store}
          sort={sort}
          onSort={setSort}
          onClear={() => setQ('')}
          fetchDeals={fetchDeals}
          initialDeals={initialDeals}
          initialTags={initialTags}
          now={clock}
        />
        </div>
      </main>
      <Footer year={new Date(now).getUTCFullYear()} stores={stores.map((s) => s.store)} />
    </div>
  )
}
