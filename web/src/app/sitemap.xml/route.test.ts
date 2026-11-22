import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ getSupabase: vi.fn(() => ({})) }))
vi.mock('../../lib/deals', () => ({ fetchLatestDeal: vi.fn(), fetchAllDealRefs: vi.fn(), fetchHashtagCounts: vi.fn() }))
vi.mock('../../lib/guides-data', () => ({ fetchGuides: vi.fn() }))
vi.mock('../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../lib/page-copy', () => ({ fetchPageCopies: vi.fn() }))

import { fetchLatestDeal } from '../../lib/deals'
import { fetchEvents } from '../../lib/events-data'
import { fetchGuides } from '../../lib/guides-data'
import { fetchPageCopies } from '../../lib/page-copy'
import { GET } from './route'

describe('GET /sitemap.xml', () => {
  beforeEach(() => {
    vi.mocked(fetchLatestDeal).mockResolvedValue({ publishedAt: '2026-11-22T08:00:00Z' } as never)
    vi.mocked(fetchGuides).mockResolvedValue([{ updatedAt: '2026-11-10T00:00:00Z' }] as never)
    vi.mocked(fetchPageCopies).mockImplementation(async (_c, kind) =>
      (kind === 'static' ? [{ kind, slug: 'chollos', updatedAt: '2026-11-21T00:00:00Z' }] : []) as never,
    )
    vi.mocked(fetchEvents).mockResolvedValue([])
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.NEXT_PHASE
    vi.restoreAllMocks()
  })

  it('serves the index as XML with the three sitemaps and their lastmod', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml; charset=utf-8')
    expect(res.headers.get('Cache-Control')).toContain('public, s-maxage=3600')
    const xml = await res.text()
    expect(xml).toContain('<sitemapindex')
    expect(xml).toContain('<loc>https://www.patobarato.com/sitemaps/chollos.xml</loc><lastmod>2026-11-22T08:00:00.000Z</lastmod>')
    expect(xml).toContain('<loc>https://www.patobarato.com/sitemaps/paginas.xml</loc><lastmod>2026-11-21T00:00:00.000Z</lastmod>')
    expect(xml).toContain('<sitemap><loc>https://www.patobarato.com/sitemaps/eventos.xml</loc></sitemap>')
  })

  it('throws at runtime when a read fails', async () => {
    vi.mocked(fetchLatestDeal).mockRejectedValue(new Error('down'))
    await expect(GET()).rejects.toThrow('down')
  })

  it('serves the index without lastmod when a read fails during the build', async () => {
    process.env.NEXT_PHASE = 'phase-production-build'
    vi.mocked(fetchLatestDeal).mockRejectedValue(new Error('down'))
    const xml = await (await GET()).text()
    expect(xml).toContain('<sitemap><loc>https://www.patobarato.com/sitemaps/chollos.xml</loc></sitemap>')
    expect(xml).not.toContain('<lastmod>')
  })
})
