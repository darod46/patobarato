import { useEffect, useState } from 'react'
import { useDeals, type DealsFetcher } from '../hooks/useDeals'
import type { HashtagCount } from '../lib/types'
import { DealCard } from './DealCard'
import { DealCardSkeleton } from './DealCardSkeleton'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { HashtagChips } from './HashtagChips'

type Props = {
  q: string
  tag: string | null
  onTag: (tag: string | null) => void
  onClear: () => void
  fetchDeals: DealsFetcher
  fetchHashtags: () => Promise<HashtagCount[]>
  now: Date
}

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4 lg:gap-6'

export function DealFeed({ q, tag, onTag, onClear, fetchDeals, fetchHashtags, now }: Props) {
  const { deals, status, hasMore, loadingMore, loadMore, retry } = useDeals(fetchDeals, { q, tag })
  const [tags, setTags] = useState<string[]>([])
  // Chips load once; keep the first fetcher so an unstable prop cannot refetch.
  const [loadTags] = useState(() => fetchHashtags)

  useEffect(() => {
    let cancelled = false
    loadTags()
      .then((list) => {
        if (!cancelled) setTags(list.map((h) => h.tag))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [loadTags])

  return (
    <div className="flex flex-col gap-6">
      {tags.length > 0 && <HashtagChips tags={tags} active={tag} onSelect={onTag} />}
      {status === 'loading' && (
        <div data-testid="feed-skeletons" className={GRID}>
          {Array.from({ length: 6 }, (_, i) => (
            <DealCardSkeleton key={i} />
          ))}
        </div>
      )}
      {status === 'error' && <ErrorState onRetry={retry} />}
      {status === 'ready' && deals.length === 0 && <EmptyState onClear={onClear} />}
      {status === 'ready' && deals.length > 0 && (
        <>
          <div className={GRID}>
            {deals.map((deal) => (
              <DealCard key={deal.publicationId} deal={deal} now={now} onTagClick={onTag} />
            ))}
          </div>
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto rounded-lg bg-carbon px-6 py-2.5 text-sm font-semibold text-white hover:bg-carbon-soft disabled:opacity-60"
            >
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
