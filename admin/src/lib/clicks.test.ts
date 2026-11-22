import { describe, expect, it } from 'vitest'
import { buildClickTable, clickDays, listClicks, PLACEMENTS } from './clicks'

function fakeClient(data: unknown, error: { message: string } | null = null) {
  const ops: [string, unknown[]][] = []
  let table = ''
  const chain: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data, error })
        return (...args: unknown[]) => {
          ops.push([prop, args])
          return chain
        }
      },
    },
  )
  return {
    client: { from: (t: string) => ((table = t), chain) } as never,
    ops,
    table: () => table,
  }
}

describe('clickDays', () => {
  it('lists days newest first in Madrid time', () => {
    // 22:30 UTC on 21 Nov is 23:30 in Madrid (still the 21st); 23:30 UTC is 00:30 on the 22nd.
    expect(clickDays(3, Date.parse('2026-11-21T22:30:00Z'))).toEqual(['2026-11-21', '2026-11-20', '2026-11-19'])
    expect(clickDays(3, Date.parse('2026-11-21T23:30:00Z'))).toEqual(['2026-11-22', '2026-11-21', '2026-11-20'])
  })
  it('crosses month boundaries', () => {
    expect(clickDays(3, Date.parse('2026-12-01T10:00:00Z'))).toEqual(['2026-12-01', '2026-11-30', '2026-11-29'])
  })
})

describe('listClicks', () => {
  it('queries the daily view from today (Madrid) minus 13 days', async () => {
    const f = fakeClient([{ day: '2026-11-22', placement: 'hero', clicks: '5' }])
    const rows = await listClicks(f.client, 14, Date.parse('2026-11-22T10:00:00Z'))
    expect(f.table()).toBe('cta_clicks_daily')
    expect(f.ops).toContainEqual(['select', ['day, placement, clicks']])
    expect(f.ops).toContainEqual(['gte', ['day', '2026-11-09']])
    expect(rows).toEqual([{ day: '2026-11-22', placement: 'hero', clicks: 5 }])
  })
  it('throws on error', async () => {
    const f = fakeClient(null, { message: 'boom' })
    await expect(listClicks(f.client)).rejects.toThrow('boom')
  })
})

describe('buildClickTable', () => {
  it('zero-fills and sums rows and columns', () => {
    const t = buildClickTable(
      [
        { day: 'd2', placement: 'hero', clicks: 3 },
        { day: 'd2', placement: 'footer', clicks: 1 },
        { day: 'd1', placement: 'hero', clicks: 2 },
        { day: 'dx', placement: 'hero', clicks: 99 },
        { day: 'd1', placement: 'other', clicks: 99 },
      ],
      ['d2', 'd1'],
      ['hero', 'footer'],
    )
    expect(t.rows).toEqual([
      { day: 'd2', cells: [3, 1], total: 4 },
      { day: 'd1', cells: [2, 0], total: 2 },
    ])
    expect(t.totals).toEqual([5, 1])
    expect(t.grandTotal).toBe(6)
  })
  it('exposes placements in order', () => {
    expect(PLACEMENTS.map((p) => p.id)).toEqual(['header', 'hero', 'block', 'recent', 'deal', 'footer', 'contact'])
  })
})
