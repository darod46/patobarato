'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const DEBOUNCE_MS = 300

function writeUrl(q: string) {
  const params = new URLSearchParams(window.location.search)
  if (q) params.set('q', q)
  else params.delete('q')
  const search = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
}

/**
 * The search text of `/buscar`. Read once from `?q=` on mount (the server render uses `initialQ`);
 * `setQ` updates the state at once and mirrors it into the URL with `replaceState` after a debounce.
 * `flush` writes the URL immediately (Enter).
 */
export function useSearchQuery(initialQ = '') {
  const [q, setQState] = useState(initialQ)
  const latest = useRef(initialQ)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('q') ?? ''
    if (fromUrl && fromUrl !== latest.current) {
      latest.current = fromUrl
      // oxlint-disable-next-line react/set-state-in-effect
      setQState(fromUrl)
    }
    return () => clearTimeout(timer.current)
  }, [])

  const setQ = useCallback((next: string) => {
    latest.current = next
    setQState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => writeUrl(next.trim() ? next : ''), DEBOUNCE_MS)
  }, [])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    writeUrl(latest.current.trim() ? latest.current : '')
  }, [])

  return { q, setQ, flush }
}
