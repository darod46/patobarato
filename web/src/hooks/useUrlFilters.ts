import { useCallback, useEffect, useState } from 'react'

type Filters = { q: string; tag: string | null }

function read(): Filters {
  const params = new URLSearchParams(window.location.search)
  const rawTag = (params.get('tag') ?? '').toLowerCase()
  const tag = /^[\p{L}\p{N}_]+$/u.test(rawTag) ? rawTag : null
  return { q: params.get('q') ?? '', tag }
}

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
}

export function useUrlFilters() {
  const [filters, setFilters] = useState<Filters>(read)

  useEffect(() => {
    const onPop = () => setFilters(read())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const setQ = useCallback((q: string) => {
    write('replace', { q: q.trim() ? q : '' })
    setFilters(read())
  }, [])
  const setTag = useCallback((tag: string | null) => {
    write('push', { tag })
    setFilters(read())
  }, [])
  const clear = useCallback(() => {
    write('push', { q: '', tag: null })
    setFilters(read())
  }, [])

  return { q: filters.q, tag: filters.tag, setQ, setTag, clear }
}
