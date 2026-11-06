import { useCallback, useEffect, useRef, useState } from 'react'
import type { DealSort } from '../lib/deals'
import type { Deal } from '../lib/types'

export type DealsFetcher = (params: {
  q?: string
  tag?: string
  sort?: DealSort
  page: number
}) => Promise<{ deals: Deal[]; hasMore: boolean }>

type Status = 'loading' | 'ready' | 'error'

type Filters = { q: string; tag: string | null; sort?: DealSort }

/** Page 0 for the given filters, typically rendered on the server. */
export type InitialDeals = Filters & { deals: Deal[]; hasMore: boolean }

const filtersKey = ({ q, tag, sort }: Filters) => JSON.stringify([q, tag, sort ?? 'recientes'])

/**
 * When the first render's filters match `initial`, its deals are shown right away and page 0
 * is not fetched; any other filters (now or later) are fetched as usual.
 */
export function useDeals(fetcher: DealsFetcher, filters: Filters, initial?: InitialDeals) {
  const { q, tag } = filters
  const sort = filters.sort ?? 'recientes'
  const key = filtersKey(filters)
  // The initial page counts only if it was fetched for the first render's filters.
  const [initialKey] = useState(() => (initial && filtersKey(initial) === key ? key : null))
  const [deals, setDeals] = useState<Deal[]>(() => (initialKey ? initial!.deals : []))
  const [status, setStatus] = useState<Status>(initialKey ? 'ready' : 'loading')
  const [hasMore, setHasMore] = useState(() => (initialKey ? initial!.hasMore : false))
  const [loadingMore, setLoadingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const requestId = useRef(0)
  const page = useRef(0)
  const fetcherRef = useRef(fetcher)
  // Until the first fetch, page 0 of the initial filters is already in state.
  const initialPending = useRef(initialKey !== null)

  // Reset to a loading state during render when the filters change.
  const [prevKey, setPrevKey] = useState(key)
  if (key !== prevKey) {
    setPrevKey(key)
    setStatus('loading')
    setLoadingMore(false)
  }

  useEffect(() => {
    fetcherRef.current = fetcher
  })

  useEffect(() => {
    // Returning without clearing the flag keeps StrictMode's second effect run from fetching.
    if (initialPending.current && key === initialKey) return
    initialPending.current = false
    const id = ++requestId.current
    page.current = 0
    fetcherRef
      .current({ q: q || undefined, tag: tag ?? undefined, sort, page: 0 })
      .then((res) => {
        if (id !== requestId.current) return
        setDeals(res.deals)
        setHasMore(res.hasMore)
        setStatus('ready')
      })
      .catch(() => {
        if (id !== requestId.current) return
        setStatus('error')
      })
  }, [key, initialKey, q, tag, sort, attempt])

  const loadMore = useCallback(() => {
    const id = requestId.current
    const next = page.current + 1
    setLoadingMore(true)
    fetcherRef
      .current({ q: q || undefined, tag: tag ?? undefined, sort, page: next })
      .then((res) => {
        if (id !== requestId.current) return
        page.current = next
        setDeals((prev) => {
          const seen = new Set(prev.map((d) => d.publicationId))
          return [...prev, ...res.deals.filter((d) => !seen.has(d.publicationId))]
        })
        setHasMore(res.hasMore)
        setLoadingMore(false)
      })
      .catch(() => {
        if (id !== requestId.current) return
        setLoadingMore(false)
      })
  }, [q, tag, sort])

  const retry = useCallback(() => {
    setStatus('loading')
    setLoadingMore(false)
    setAttempt((n) => n + 1)
  }, [])

  return { deals, status, hasMore, loadingMore, loadMore, retry }
}
