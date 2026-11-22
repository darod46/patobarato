import type { SupabaseClient } from '@supabase/supabase-js'

export type ClickRow = { day: string; placement: string; clicks: number }

export const PLACEMENTS = [
  { id: 'header', label: 'Cabecera' },
  { id: 'hero', label: 'Hero' },
  { id: 'block', label: 'Bloque portada' },
  { id: 'recent', label: 'Últimos mensajes' },
  { id: 'deal', label: 'Ficha de chollo' },
  { id: 'footer', label: 'Pie' },
  { id: 'contact', label: 'Contacto' },
] as const

const madridDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' })

/** The last `n` Madrid calendar days as `yyyy-mm-dd`, newest first. */
export function clickDays(n: number, now: number = Date.now()): string[] {
  const [y, m, d] = madridDate.format(new Date(now)).split('-').map(Number)
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10))
}

export async function listClicks(client: SupabaseClient, days = 14, now: number = Date.now()): Promise<ClickRow[]> {
  const from = clickDays(days, now).at(-1)!
  const { data, error } = await client.from('cta_clicks_daily').select('day, placement, clicks').gte('day', from)
  if (error) throw new Error(error.message)
  // bigint can arrive as a string.
  return ((data ?? []) as { day: string; placement: string; clicks: number | string }[]).map((r) => ({
    day: r.day,
    placement: r.placement,
    clicks: Number(r.clicks),
  }))
}

export function buildClickTable(rows: ClickRow[], days: string[], placements: string[]) {
  const dayIdx = new Map(days.map((d, i) => [d, i]))
  const placeIdx = new Map(placements.map((p, i) => [p, i]))
  const cells = days.map(() => placements.map(() => 0))
  for (const r of rows) {
    const i = dayIdx.get(r.day)
    const j = placeIdx.get(r.placement)
    if (i !== undefined && j !== undefined) cells[i][j] += r.clicks
  }
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const totals = placements.map((_, j) => sum(cells.map((c) => c[j])))
  return {
    rows: days.map((day, i) => ({ day, cells: cells[i], total: sum(cells[i]) })),
    totals,
    grandTotal: sum(totals),
  }
}
