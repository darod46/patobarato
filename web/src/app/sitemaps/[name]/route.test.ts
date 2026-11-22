import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../lib/supabase', () => ({ getSupabase: vi.fn(() => ({})) }))
vi.mock('../../../lib/deals', () => ({ fetchLatestDeal: vi.fn(), fetchAllDealRefs: vi.fn(), fetchHashtagCounts: vi.fn() }))
vi.mock('../../../lib/guides-data', () => ({ fetchGuides: vi.fn() }))
vi.mock('../../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../../lib/page-copy', () => ({ fetchPageCopies: vi.fn() }))
vi.mock('../../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

import { fetchAllDealRefs, fetchHashtagCounts } from '../../../lib/deals'
import { fetchEvents } from '../../../lib/events-data'
import { fetchGuides } from '../../../lib/guides-data'
import { fetchPageCopies } from '../../../lib/page-copy'
import { fetchStores } from '../../../lib/stores-data'
import { siteEvent } from '../../../test-utils/siteEvent'
import { GET } from './route'

const get = (name: string) => GET(new Request(`http://localhost/sitemaps/${name}`), { params: Promise.resolve({ name }) })

describe('GET /sitemaps/[name]', () => {
  beforeEach(() => {
    vi.mocked(fetchAllDealRefs).mockResolvedValue([
      { store: 'amazon', asin: 'B0ABCDEF12', title: 'Freidora de aire', publishedAt: '2026-11-04T11:19:00Z' },
    ])
    vi.mocked(fetchHashtagCounts).mockResolvedValue([{ tag: 'hogar', count: 3 }, { tag: 'poco', count: 2 }])
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'amazon', deals: 10, coupons: 0 }])
    vi.mocked(fetchGuides).mockResolvedValue([])
    vi.mocked(fetchPageCopies).mockResolvedValue([])
    vi.mocked(fetchEvents).mockResolvedValue([siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27' })])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.NEXT_PHASE
    vi.restoreAllMocks()
  })

  it.each(['otro.xml', 'chollos', 'chollos.txt', 'paginas.xml.xml'])('returns 404 for %s', async (name) => {
    expect((await get(name)).status).toBe(404)
  })

  it('serves the deals sitemap as XML', async () => {
    const res = await get('chollos.xml')
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400')
    const xml = await res.text()
    expect(xml).toContain(
      '<url><loc>https://www.patobarato.com/oferta/amazon/freidora-de-aire-b0abcdef12</loc><lastmod>2026-11-04T11:19:00.000Z</lastmod><changefreq>daily</changefreq></url>',
    )
  })

  it('serves the pages sitemap with categories and indexable stores', async () => {
    const xml = await (await get('paginas.xml')).text()
    expect(xml).toContain('<loc>https://www.patobarato.com/chollos/hogar</loc>')
    expect(xml).not.toContain('/chollos/poco')
    expect(xml).toContain('<loc>https://www.patobarato.com/tiendas/amazon</loc>')
    expect(xml).toContain('<loc>https://www.patobarato.com/sobre-nosotros</loc>')
    expect(xml).not.toContain('/oferta/')
  })

  it('serves the events sitemap', async () => {
    const xml = await (await get('eventos.xml')).text()
    expect(xml).toContain('<loc>https://www.patobarato.com/eventos/black-friday</loc>')
  })

  it('throws at runtime when a read fails', async () => {
    vi.mocked(fetchStores).mockRejectedValue(new Error('down'))
    await expect(get('paginas.xml')).rejects.toThrow('down')
  })

  it('serves the minimal file when a read fails during the build', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.mocked(fetchAllDealRefs).mockRejectedValue(new Error('down'))
    vi.mocked(fetchStores).mockRejectedValue(new Error('down'))
    const deals = await (await get('chollos.xml')).text()
    expect(deals).not.toContain('<url>')
    const pages = await (await get('paginas.xml')).text()
    expect(pages).toContain('<loc>https://www.patobarato.com/</loc>')
    expect(pages).not.toContain('/tiendas/amazon')
  })
})
