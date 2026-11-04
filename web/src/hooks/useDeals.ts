import { useCallback, useEffect, useRef, useState } from 'react'
import type { Deal } from '../lib/types'

export type DealsFetcher = (params: {
  q?: string
  tag?: string
  page: number
}) => Promise<{ deals: Deal[]; hasMore: boolean }>

type Status = 'loading' | 'ready' | 'error'

export function useDeals(fetcher: DealsFetcher, filters: { q: string; tag: string | null }) {
  const { q, tag } = filters
  const [deals, setDeals] = useState<Deal[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const requestId = useRef(0)
  const page = useRef(0)
  const fetcherRef = useRef(fetcher)

  // Reset to a loading state during render when the filters change.
  const key = JSON.stringify([q, tag])
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
    const id = ++requestId.current
    page.current = 0
    fetcherRef
      .current({ q: q || undefined, tag: tag ?? undefined, page: 0 })
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
  }, [q, tag, attempt])

  const loadMore = useCallback(() => {
    const id = requestId.current
    const next = page.current + 1
    setLoadingMore(true)
    fetcherRef
      .current({ q: q || undefined, tag: tag ?? undefined, page: next })
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
  }, [q, tag])

  const retry = useCallback(() => {
    setStatus('loading')
    setLoadingMore(false)
    setAttempt((n) => n + 1)
  }, [])

  return { deals, status, hasMore, loadingMore, loadMore, retry }
}
