import { useEffect, useState } from 'react'
import { useDeals, type DealsFetcher, type InitialDeals } from '../hooks/useDeals'
import type { DealSort } from '../lib/deals'
import type { HashtagCount } from '../lib/types'
import { DealCard } from './DealCard'
import { DealCardSkeleton } from './DealCardSkeleton'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { HashtagChips } from './HashtagChips'

type Props = {
  q: string
  tag: string | null
  /** Listing order; without `onSort` the order cannot be changed from this feed. */
  sort?: DealSort
  onSort?: (sort: DealSort) => void
  /** Chips filter in place through this callback; without it they are links to the hashtag pages. */
  onTag?: (tag: string | null) => void
  onClear: () => void
  fetchDeals: DealsFetcher
  /** Used only when `initialTags` is not given. */
  fetchHashtags?: () => Promise<HashtagCount[]>
  /** Server-rendered page 0; used only if its filters match the first render's. */
  initialDeals?: InitialDeals
  /** Server-rendered chips; when given, chips are not fetched. */
  initialTags?: string[]
  now: Date
}

const GRID = 'grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5'

export function DealFeed({
  q,
  tag,
  sort = 'recientes',
  onTag,
  onClear,
  fetchDeals,
  fetchHashtags,
  initialDeals,
  initialTags,
  now,
}: Props) {
  const { deals, status, hasMore, loadingMore, loadMore, retry } = useDeals(
    fetchDeals,
    { q, tag, sort },
    initialDeals,
  )
  const [tags, setTags] = useState<string[]>(() => initialTags ?? [])
  // Chips load once; keep the first fetcher so an unstable prop cannot refetch.
  const [loadTags] = useState(() => (initialTags ? undefined : fetchHashtags))

  useEffect(() => {
    if (!loadTags) return
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
      {(tags.length > 0 || tag) && <HashtagChips tags={tags} active={tag} onSelect={onTag} />}
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
              <DealCard key={deal.publicationId} deal={deal} now={now} />
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
