import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { DealSort } from '../lib/deals'
import { parseListingFilters } from '../lib/filters'

function parse(search: string) {
  const params = new URLSearchParams(search)
  return parseListingFilters((key) => params.get(key))
}

// Our own history writes do not fire popstate, so subscribers are notified explicitly.
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener('popstate', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('popstate', onChange)
  }
}

const getSearch = () => window.location.search

type UrlChanges = { tag?: string | null; tienda?: string | null; orden?: string }

function write(mode: 'push' | 'replace', changes: UrlChanges) {
  const params = new URLSearchParams(window.location.search)
  for (const [key, value] of Object.entries(changes)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }
  const search = params.toString()
  const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
  if (mode === 'push') window.history.pushState(null, '', url)
  else window.history.replaceState(null, '', url)
  for (const listener of listeners) listener()
}

/**
 * The server (and the hydration render) has no URL: filters start from `serverSearch` (empty by
 * default; a page that rendered for known filters passes them) and the client re-renders with the
 * real query string right after hydrating.
 */
export function useUrlFilters(serverSearch = '') {
  const search = useSyncExternalStore(subscribe, getSearch, () => serverSearch)
  const filters = useMemo(() => parse(search), [search])

  const setTag = useCallback((tag: string | null) => write('push', { tag }), [])
  const setStore = useCallback((store: string | null) => write('push', { tienda: store }), [])
  // The default order is the absence of the param, so `/` stays the canonical listing URL.
  const setSort = useCallback(
    (sort: DealSort) => write('push', { orden: sort === 'recientes' ? '' : sort }),
    [],
  )
  const clear = useCallback(() => write('push', { tag: null, tienda: null, orden: '' }), [])

  return {
    tag: filters.tag,
    store: filters.store,
    sort: filters.sort,
    setTag,
    setStore,
    setSort,
    clear,
  }
}
