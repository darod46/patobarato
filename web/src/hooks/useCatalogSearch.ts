'use client'

import { useEffect, useRef, useState } from 'react'
import type { CatalogProduct } from '../lib/catalog'

export type CatalogState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  products: CatalogProduct[]
}

export type CatalogFetcher = (q: string, signal: AbortSignal) => Promise<CatalogProduct[]>

const DEBOUNCE_MS = 300
const IDLE: CatalogState = { status: 'idle', products: [] }

/** Debounced catalogue search: aborts the in-flight request on a new `q` and ignores stale results. */
export function useCatalogSearch(q: string, fetcher: CatalogFetcher, minLength = 2): CatalogState {
  const [state, setState] = useState<CatalogState>(IDLE)
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })
  const term = q.trim()
  const active = term.length >= minLength

  useEffect(() => {
    // Sequence guard: each effect run owns one request; cleanup marks it stale.
    const run = { stale: false }
    if (!active) {
      // oxlint-disable-next-line react/set-state-in-effect
      setState(IDLE)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setState((prev) => ({ status: 'loading', products: prev.products }))
      fetcherRef
        .current(term, controller.signal)
        .then((products) => {
          if (!run.stale) setState({ status: 'ready', products })
        })
        .catch((error: unknown) => {
          if (run.stale) return
          if ((error as { name?: string } | null)?.name === 'AbortError') return
          setState({ status: 'error', products: [] })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
      // A late resolve can never land after unmount or a new q.
      run.stale = true
    }
  }, [term, active])

  return active ? state : IDLE
}
