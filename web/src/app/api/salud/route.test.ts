import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({ getSupabase: vi.fn() }))
vi.mock('../../../lib/stores-data', () => ({ fetchStores: vi.fn() }))
vi.mock('../../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../../lib/page-copy', () => ({ fetchPageCopies: vi.fn() }))

import { fetchEvents } from '../../../lib/events-data'
import { fetchPageCopies } from '../../../lib/page-copy'
import { fetchStores } from '../../../lib/stores-data'
import { getSupabase } from '../../../lib/supabase'
import { GET } from './route'

const mockSupabase = vi.mocked(getSupabase)
const mockStores = vi.mocked(fetchStores)
const mockEvents = vi.mocked(fetchEvents)
const mockCopies = vi.mocked(fetchPageCopies)

describe('GET /api/salud', () => {
  beforeEach(() => {
    mockSupabase.mockReset()
    mockStores.mockReset()
    mockEvents.mockReset()
    mockCopies.mockReset().mockResolvedValue([])
    mockSupabase.mockReturnValue({} as ReturnType<typeof getSupabase>)
  })

  it('reports ok with counts on the happy path', async () => {
    mockStores.mockResolvedValue([
      { store: 'a', deals: 3, coupons: 0 },
      { store: 'b', deals: 4, coupons: 1 },
    ])
    mockEvents.mockResolvedValue([{}, {}] as Awaited<ReturnType<typeof fetchEvents>>)
    mockCopies.mockResolvedValue([{}, {}, {}] as Awaited<ReturnType<typeof fetchPageCopies>>)
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(new Date(body.at).toISOString()).toBe(body.at)
    expect(body.checks).toEqual({ supabase: 'ok', deals: 7, events: 2, copies: 3 })
    expect(mockCopies).toHaveBeenCalledWith({}, 'static')
  })

  it('returns 200 with ok:false when getSupabase throws synchronously, without leaking the message', async () => {
    mockSupabase.mockImplementation(() => {
      throw new Error('boom https://xyz.supabase.co key')
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain('supabase.co')
    expect(text).not.toContain('boom')
    expect(JSON.parse(text)).toMatchObject({
      ok: false,
      checks: { supabase: 'error', errorName: 'Error', deals: null, events: null, copies: null },
    })
  })

  it('reports the error name of a rejected fetch', async () => {
    mockStores.mockRejectedValue(new TypeError('fetch failed'))
    mockEvents.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.checks).toMatchObject({ supabase: 'error', errorName: 'TypeError', deals: null, events: null })
    expect(JSON.stringify(body)).not.toContain('fetch failed')
  })

  it('reports copies null (and the error) when the page copy read fails', async () => {
    mockStores.mockResolvedValue([])
    mockEvents.mockResolvedValue([])
    mockCopies.mockRejectedValue(new Error('relation "web_page_copy" does not exist'))
    const body = await (await GET()).json()
    expect(body.ok).toBe(false)
    expect(body.checks).toEqual({ supabase: 'error', errorName: 'Error', deals: null, events: null, copies: null })
    expect(JSON.stringify(body)).not.toContain('web_page_copy')
  })
})
