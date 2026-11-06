import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { parseDealSort, type DealSort } from '../lib/deals'

type Filters = { q: string; tag: string | null; store: string | null; sort: DealSort }

function parse(search: string): Filters {
  const params = new URLSearchParams(search)
  const rawTag = (params.get('tag') ?? '').toLowerCase()
  const tag = /^[\p{L}\p{N}_]+$/u.test(rawTag) ? rawTag : null
  const rawStore = (params.get('tienda') ?? '').toLowerCase()
  const store = /^[a-z0-9_]+$/.test(rawStore) ? rawStore : null
  return { q: params.get('q') ?? '', tag, store, sort: parseDealSort(params.get('orden')) }
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
// The server (and the hydration render) has no URL: filters start empty and the
// client re-renders with the real query string right after hydrating.
const getServerSearch = () => ''

type UrlChanges = { q?: string; tag?: string | null; tienda?: string | null; orden?: string }

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

export function useUrlFilters() {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch)
  const filters = useMemo(() => parse(search), [search])

  const setQ = useCallback((q: string) => write('replace', { q: q.trim() ? q : '' }), [])
  const setTag = useCallback((tag: string | null) => write('push', { tag }), [])
  const setStore = useCallback((store: string | null) => write('push', { tienda: store }), [])
  // The default order is the absence of the param, so `/` stays the canonical listing URL.
  const setSort = useCallback(
    (sort: DealSort) => write('push', { orden: sort === 'recientes' ? '' : sort }),
    [],
  )
  const clear = useCallback(() => write('push', { q: '', tag: null, tienda: null, orden: '' }), [])

  return {
    q: filters.q,
    tag: filters.tag,
    store: filters.store,
    sort: filters.sort,
    setQ,
    setTag,
    setStore,
    setSort,
    clear,
  }
}
