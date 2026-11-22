'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildClickTable, clickDays, listClicks, PLACEMENTS, type ClickRow } from '../../lib/clicks'
import { createBrowserSupabase } from '../../lib/supabase/browser'

const DAYS = 14

export default function ClicsPage() {
  const [rows, setRows] = useState<ClickRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listClicks(createBrowserSupabase(), DAYS)
      .then((r) => {
        if (!cancelled) setRows(r)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar los clics')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const table = useMemo(
    () => (rows ? buildClickTable(rows, clickDays(DAYS), PLACEMENTS.map((p) => p.id)) : null),
    [rows],
  )

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Clics a Telegram</h1>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {rows === null && !error && <p role="status">Cargando…</p>}
      {table && table.grandTotal === 0 && <p>Sin clics todavía</p>}
      {table && table.grandTotal > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="pb-2 text-left text-xs text-neutral-600">Clics por día y ubicación, últimos {DAYS} días</caption>
            <thead>
              <tr className="border-b border-neutral-300 text-left">
                <th scope="col" className="py-2 pr-3">Día</th>
                {PLACEMENTS.map((p) => (
                  <th key={p.id} scope="col" className="px-2 py-2 text-right">{p.label}</th>
                ))}
                <th scope="col" className="px-2 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.day} className="border-b border-neutral-200">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{r.day}</th>
                  {r.cells.map((c, i) => (
                    <td key={PLACEMENTS[i].id} className="px-2 py-2 text-right tabular-nums">{c}</td>
                  ))}
                  <td className="px-2 py-2 text-right font-medium tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium">
                <th scope="row" className="py-2 pr-3 text-left">Total</th>
                {table.totals.map((t, i) => (
                  <td key={PLACEMENTS[i].id} className="px-2 py-2 text-right tabular-nums">{t}</td>
                ))}
                <td className="px-2 py-2 text-right tabular-nums">{table.grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  )
}
