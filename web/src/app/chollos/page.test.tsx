import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as deals from '../../lib/deals'
import * as eventsData from '../../lib/events-data'
import * as pageCopy from '../../lib/page-copy'
import * as storesData from '../../lib/stores-data'
import DealsPage, * as pageModule from './page'
import { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn().mockResolvedValue([]) }))
vi.mock('../../lib/events-data', () => ({ fetchEvents: vi.fn().mockResolvedValue([]) }))
vi.mock('../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/page-copy')>()),
  fetchPageCopy: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../lib/deals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/deals')>()),
  fetchDeals: vi.fn(),
  fetchHashtags: vi.fn().mockResolvedValue([]),
}))


describe('/chollos', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    history.replaceState(null, '', '/')
  })

  it('is dynamic: it reads the filters per request', () => {
    expect(pageModule).not.toHaveProperty('revalidate')
  })

  it('fetches page 0 with the validated tag, order and store and hands it to the client', async () => {
    const fetchDeals = vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    history.replaceState(null, '', '/chollos?tag=lego&orden=minimo&tienda=aliexpress')
    render(await DealsPage({ searchParams: Promise.resolve({ tag: 'LEGO', orden: 'minimo', tienda: 'aliexpress' }) }))
    expect(fetchDeals).toHaveBeenCalledWith({}, { page: 0, tag: 'lego', store: 'aliexpress', sort: 'minimo' })
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
    // The server page is already there: the client did not need to fetch anything.
    expect(fetchDeals).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed filters and uses the first value of a repeated one', async () => {
    const fetchDeals = vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    render(await DealsPage({ searchParams: Promise.resolve({ tag: ['a}', 'b'], orden: 'xyz', tienda: 'a b' }) }))
    expect(fetchDeals).toHaveBeenCalledWith({}, { page: 0, tag: undefined, store: undefined, sort: 'recientes' })
  })

  it('keeps a legacy ?tag= canonical to the tag page', async () => {
    const meta = await generateMetadata({ searchParams: Promise.resolve({ tag: 'Hogar' }) })
    expect(meta.alternates?.canonical).toBe('/chollos/hogar')
  })

  it('has the fixed title and a canonical on /chollos, also without data', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('Chollos de hoy · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/chollos')
    expect(meta.robots).toBeUndefined()
  })

  it('renders the listing page and the breadcrumb even when the server fetch fails', async () => {
    vi.mocked(deals.fetchDeals).mockRejectedValue(new Error('down'))
    const { container } = render(await DealsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Inicio', 'Chollos'])
    expect(ld.itemListElement[1].item).toMatch(/\/chollos$/)
  })

  it('titles the page with the live totals from web_stores', async () => {
    vi.mocked(storesData.fetchStores).mockResolvedValueOnce([
      { store: 'amazon', deals: 300, coupons: 0 },
      { store: 'aliexpress', deals: 15, coupons: 2 },
      { store: 'pccomponentes', deals: 0, coupons: 3 },
    ])
    const meta = await generateMetadata()
    expect(meta.title).toBe('Chollos de hoy: 315 ofertas en Amazon y AliExpress · PatoBarato')
    expect(meta.robots).toBeUndefined()
  })

  it('keeps the plain title and stays indexable when the stores read fails', async () => {
    vi.mocked(storesData.fetchStores).mockRejectedValueOnce(new Error('down'))
    const meta = await generateMetadata()
    expect(meta.title).toBe('Chollos de hoy · PatoBarato')
    expect(meta.robots).toBeUndefined()
  })

  it('renders the static/chollos copy with the computed values and the next event', async () => {
    vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    vi.mocked(storesData.fetchStores).mockResolvedValue([{ store: 'amazon', deals: 40, coupons: 0 }])
    vi.mocked(pageCopy.fetchPageCopy).mockResolvedValue({
      kind: 'static', slug: 'chollos', title: 'Chollos de hoy en Amazon', h1: 'Los chollos de hoy',
      introMd: 'Hay {deals} chollos en {stores}.', faq: [], updatedAt: '2026-11-01T00:00:00Z',
    })
    const today = new Date()
    const inDays = (n: number) => new Date(today.getTime() + n * 86_400_000).toISOString().slice(0, 10)
    vi.mocked(eventsData.fetchEvents).mockResolvedValue([
      {
        id: 1, slug: 'black-friday', name: 'Black Friday', stores: [], startsOn: inDays(5), endsOn: inDays(7),
        approximate: false, hashtags: [], aliexpressPromo: null, introMd: '', tipsMd: '', faq: [], updatedAt: '2026-11-01T00:00:00Z',
      },
    ])
    try {
      render(await DealsPage())
      expect(pageCopy.fetchPageCopy).toHaveBeenCalledWith({}, 'static', 'chollos')
      expect(screen.getByRole('heading', { level: 1, name: 'Los chollos de hoy' })).toBeInTheDocument()
      expect(screen.getByText('Hay 40 chollos en Amazon.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Black Friday/ })).toHaveAttribute('href', '/eventos/black-friday')
      expect((await generateMetadata()).title).toBe('Chollos de hoy en Amazon · PatoBarato')
    } finally {
      vi.mocked(storesData.fetchStores).mockResolvedValue([])
      vi.mocked(pageCopy.fetchPageCopy).mockResolvedValue(null)
      vi.mocked(eventsData.fetchEvents).mockResolvedValue([])
    }
  })

  it('renders the default heading when the copy and events reads fail', async () => {
    vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    vi.mocked(pageCopy.fetchPageCopy).mockRejectedValueOnce(new Error('down'))
    vi.mocked(eventsData.fetchEvents).mockRejectedValueOnce(new Error('down'))
    render(await DealsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
  })
})
