import { useCallback, useMemo, useSyncExternalStore } from 'react'

type Filters = { q: string; tag: string | null }

function parse(search: string): Filters {
  const params = new URLSearchParams(search)
  const rawTag = (params.get('tag') ?? '').toLowerCase()
  const tag = /^[\p{L}\p{N}_]+$/u.test(rawTag) ? rawTag : null
  return { q: params.get('q') ?? '', tag }
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

function write(mode: 'push' | 'replace', changes: Partial<Filters>) {
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
  const clear = useCallback(() => write('push', { q: '', tag: null }), [])

  return { q: filters.q, tag: filters.tag, setQ, setTag, clear }
}
