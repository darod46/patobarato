'use client'

import { useCallback, useState } from 'react'
import { useCatalogSearch, type CatalogFetcher } from '../hooks/useCatalogSearch'
import { useClock } from '../hooks/useClock'
import type { DealsFetcher } from '../hooks/useDeals'
import { useSearchQuery } from '../hooks/useSearchQuery'
import { fetchCatalogSearch } from '../lib/catalog'
import * as api from '../lib/deals'
import type { StoreStats } from '../lib/stores-data'
import { getSupabase } from '../lib/supabase'
import { DealFeed } from './DealFeed'
import { Footer } from './Footer'
import { Header } from './Header'
import { CatalogBlock } from './search/CatalogBlock'
import { SearchField } from './search/SearchField'
import { SearchShortcuts } from './search/SearchShortcuts'

type Props = {
  /** Server render time (ISO); the first client render uses it so hydration matches. */
  now: string
  initialQ?: string
  tags?: string[]
  stores?: StoreStats[]
  fetchDeals?: DealsFetcher
  /** Replaces the AliExpress search (tests); the default calls `/api/buscar/aliexpress` and hides the block on HTTP 204. */
  fetchAli?: CatalogFetcher
  fetchCatalog?: CatalogFetcher
}

const defaultFetchDeals: DealsFetcher = async (params) => api.fetchDeals(getSupabase(), params)
const defaultFetchCatalog: CatalogFetcher = async (q) => fetchCatalogSearch(getSupabase(), q, 12)

const ALI_NOTE = 'Precio en AliExpress ahora mismo; puede variar con envío y aduanas'

/** `/buscar`: one field and three result blocks (deals, AliExpress, store catalogue). */
export function SearchClient({
  now,
  initialQ = '',
  tags = [],
  stores = [],
  fetchDeals = defaultFetchDeals,
  fetchAli,
  fetchCatalog = defaultFetchCatalog,
}: Props) {
  const { q, setQ, flush } = useSearchQuery(initialQ)
  const clock = useClock(now)
  const [aliAvailable, setAliAvailable] = useState(true)

  const defaultFetchAli = useCallback<CatalogFetcher>(
    async (term, signal) => {
      const res = await fetch(`/api/buscar/aliexpress?q=${encodeURIComponent(term)}`, { signal })
      if (res.status === 204) {
        setAliAvailable(false)
        return []
      }
      if (!res.ok) throw new Error(`aliexpress ${res.status}`)
      return ((await res.json()) as { products: Awaited<ReturnType<CatalogFetcher>> }).products
    },
    [],
  )

  const term = q.trim()
  const searching = term.length >= 2
  const ali = useCatalogSearch(term, fetchAli ?? defaultFetchAli)
  const catalog = useCatalogSearch(term, fetchCatalog)
  const clear = useCallback(() => setQ(''), [setQ])

  return (
    <div className="min-h-screen bg-white font-sans text-ink">
      <Header searchTrigger={false} />
      <main className="mx-auto max-w-[1200px] px-4 pt-24 pb-12 md:px-8 md:pt-24 md:pb-16">
        <h1 className="mb-5 font-display text-2xl font-bold tracking-[-0.02em] md:text-[32px]">
          {term.length > 1 ? `Resultados para “${term}”` : 'Buscar'}
        </h1>
        <div className="mb-8">
          <SearchField value={q} onChange={setQ} onSubmit={flush} autoFocus={initialQ === ''} />
        </div>
        {!term && <SearchShortcuts tags={tags} stores={stores.map((s) => s.store)} />}
        {term && !searching && <p className="text-muted">Escribe al menos dos letras</p>}
        {searching && (
          <div className="flex flex-col gap-12">
            <section className="flex flex-col gap-4">
              <h2 className="font-display text-xl font-bold text-ink">Chollos</h2>
              <DealFeed
                q={term}
                tag={null}
                sort="recientes"
                onClear={clear}
                fetchDeals={fetchDeals}
                initialTags={[]}
                now={clock}
              />
            </section>
            <CatalogBlock title="En AliExpress" note={ALI_NOTE} state={ali} hideWhenEmpty={!aliAvailable} />
            <CatalogBlock title="En tiendas" state={catalog} hideWhenEmpty />
          </div>
        )}
      </main>
      <Footer year={new Date(now).getUTCFullYear()} stores={stores.map((s) => s.store)} />
    </div>
  )
}
