'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ListPanelLayout, usePanelId } from '../../components/ListPanelLayout'
import { listCoupons, type CouponFilter, type CouponRow } from '../../lib/coupons'
import { isoToMadridLocal } from '../../lib/dates'
import { storeName } from '../../lib/stores'
import { createBrowserSupabase } from '../../lib/supabase/browser'
import { CouponPanel } from './CouponPanel'

const FILTERS: { id: CouponFilter; label: string }[] = [
  { id: 'active', label: 'Activos' },
  { id: 'expired', label: 'Caducados' },
  { id: 'all', label: 'Todos' },
]

function Cupones() {
  const [filter, setFilter] = useState<CouponFilter>('active')
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [rows, setRows] = useState<CouponRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [openId, setOpenId] = usePanelId()
  const client = useRef<ReturnType<typeof createBrowserSupabase> | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let cancelled = false
    client.current ??= createBrowserSupabase()
    listCoupons(client.current, { filter, q: debouncedQ })
      .then((r) => {
        if (cancelled) return
        setRows(r)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar los cupones')
      })
    return () => {
      cancelled = true
    }
  }, [filter, debouncedQ, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  const list = (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Cupones</h1>
        <button type="button" onClick={() => setOpenId('new')} className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white">
          + Nuevo cupón
        </button>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id)
              setRows(null)
            }}
            className={`min-h-11 rounded-md border px-4 text-sm ${filter === f.id ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por título o código"
        aria-label="Buscar"
        className="min-h-11 w-full rounded-md border border-neutral-300 px-3"
      />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {rows === null && !error && <p role="status">Cargando…</p>}
      {rows?.length === 0 && <p>No hay cupones.</p>}
      <ul className="divide-y divide-neutral-200">
        {rows?.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(String(r.id))}
              aria-current={openId === String(r.id)}
              className="flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left hover:bg-neutral-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                <span className="block text-xs text-neutral-600">
                  {storeName(r.store)} · {r.code}
                </span>
              </span>
              <span className="shrink-0 text-xs text-neutral-600">
                {!r.active ? 'Inactivo' : r.expiresAt ? `Caduca ${isoToMadridLocal(r.expiresAt).slice(0, 10)}` : 'Sin caducidad'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  return (
    <ListPanelLayout
      list={list}
      panel={
        openId ? (
          <CouponPanel
            id={openId}
            onChanged={refresh}
            onSaved={(id) => {
              refresh()
              setOpenId(String(id))
            }}
          />
        ) : null
      }
      onClose={() => setOpenId(null)}
    />
  )
}

export default function CuponesPage() {
  return (
    <Suspense>
      <Cupones />
    </Suspense>
  )
}
