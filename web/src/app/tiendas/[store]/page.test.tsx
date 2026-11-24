import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDeals } from '../../../lib/deals'
import { fetchCoupons } from '../../../lib/coupons'
import { fetchEvents } from '../../../lib/events-data'
import { fetchPageCopy } from '../../../lib/page-copy'
import { fetchStores } from '../../../lib/stores-data'
import type { Deal, PageCopy } from '../../../lib/types'
import { siteEvent } from '../../../test-utils/siteEvent'
import { PageFaq, PageIntro } from '../../../components/PageIntro'
import { StoreClient } from '../../../components/StoreClient'
import { payloadKeys, propsOf } from '../../../test-utils/clientProps'
import StorePage, { generateMetadata } from './page'

const deal = (id: number): Deal => ({
  publicationId: id, status: 'active', endedAt: null,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  affiliateUrl: 'https://s.click.aliexpress.com/x',
  title: `Chollo ${id}`,
  imageUrl: null,
  asin: `100500${id}`,
  country: 'es',
  store: 'aliexpress',
  productId: id,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
  priceBeforeCoupon: false,
})

const copy = (over: Partial<PageCopy> = {}): PageCopy => ({
  kind: 'store',
  slug: 'aliexpress',
  title: 'Chollos de AliExpress en España',
  h1: 'Chollos de AliExpress',
  introMd: 'Comprar en AliExpress desde España. Hay {deals} chollos activos.',
  faq: [],
  updatedAt: '2026-11-20T10:00:00Z',
  ...over,
})

vi.mock('../../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../../lib/deals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/deals')>()),
  fetchDeals: vi.fn(),
  fetchHashtags: vi.fn(async () => []),
}))
vi.mock('../../../lib/coupons', () => ({ MAX_STORE_COUPONS: 50, fetchCoupons: vi.fn(async () => []) }))
vi.mock('../../../lib/stores-data', () => ({ fetchStores: vi.fn() }))
vi.mock('../../../lib/events-data', () => ({ fetchEvents: vi.fn() }))
vi.mock('../../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))

const params = (store: string) => ({ params: Promise.resolve({ store }) })
const down = async () => {
  throw new Error('down')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(fetchDeals).mockReset().mockResolvedValue({ deals: [deal(1)], hasMore: false })
  vi.mocked(fetchStores)
    .mockReset()
    .mockResolvedValue([
      { store: 'amazon', deals: 5, coupons: 0 },
      { store: 'aliexpress', deals: 2, coupons: 1 },
    ])
  vi.mocked(fetchPageCopy).mockReset().mockResolvedValue(null)
  vi.mocked(fetchEvents).mockReset().mockResolvedValue([])
})

describe('StorePage', () => {
  it('404s for an unknown store, in the page and in the metadata', async () => {
    const page = await StorePage(params('fnac')).catch((e: unknown) => e)
    expect((page as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    const meta = await generateMetadata(params('fnac')).catch((e: unknown) => e)
    expect((meta as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('is noindex with fewer than 3 deals and no copy, titled after the store', async () => {
    const meta = await generateMetadata(params('aliexpress'))
    expect(meta.title).toBe('Chollos de AliExpress hoy: 2 ofertas · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/tiendas/aliexpress')
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  it('is indexable with copy even without deals, and says so honestly', async () => {
    vi.mocked(fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'amazon', deals: 5, coupons: 0 }])
    vi.mocked(fetchPageCopy).mockResolvedValue(copy())
    const meta = await generateMetadata(params('aliexpress'))
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Chollos de AliExpress en España · PatoBarato')
    render(await StorePage(params('aliexpress')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chollos de AliExpress')
    expect(screen.getByText('Comprar en AliExpress desde España.')).toBeInTheDocument()
    // 0 deals is no value: the {deals} sentence is dropped, never "0 chollos activos".
    expect(document.body.textContent).not.toMatch(/\{deals\}|0 chollos activos/)
    expect(await screen.findByText('Ahora mismo no hay chollos activos de AliExpress.')).toBeInTheDocument()
  })

  it('renders a store without copy and without deals, but noindex', async () => {
    vi.mocked(fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'amazon', deals: 5, coupons: 0 }])
    expect((await generateMetadata(params('decathlon'))).robots).toEqual({ index: false, follow: true })
    render(await StorePage(params('decathlon')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chollos de Decathlon')
    expect(await screen.findByText('Ahora mismo no hay chollos activos de Decathlon.')).toBeInTheDocument()
  })

  it('is indexable from 3 deals without copy', async () => {
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'aliexpress', deals: 3, coupons: 0 }])
    expect((await generateMetadata(params('aliexpress'))).robots).toBeUndefined()
  })

  it('fills the live count into the copy', async () => {
    vi.mocked(fetchPageCopy).mockResolvedValue(copy())
    render(await StorePage(params('aliexpress')))
    expect(screen.getByText(/Hay 2 chollos activos\./)).toBeInTheDocument()
  })

  it('never states a partial page as the live count in the copy', async () => {
    vi.mocked(fetchStores).mockImplementation(down)
    vi.mocked(fetchDeals).mockResolvedValue({ deals: [deal(1), deal(2), deal(3)], hasMore: true })
    vi.mocked(fetchPageCopy).mockResolvedValue(copy())
    expect((await generateMetadata(params('aliexpress'))).robots).toBeUndefined()
    render(await StorePage(params('aliexpress')))
    expect(screen.getByText('Comprar en AliExpress desde España.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/Hay 3 chollos/)
  })

  it('treats a failed copy read as no copy', async () => {
    vi.mocked(fetchPageCopy).mockImplementation(down)
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'aliexpress', deals: 4, coupons: 0 }])
    const meta = await generateMetadata(params('aliexpress'))
    expect(meta.title).toBe('Chollos de AliExpress hoy: 4 ofertas · PatoBarato')
    expect(meta.robots).toBeUndefined()
  })

  it('stays indexable with 2 deals when the copy read fails (the DB did not answer)', async () => {
    vi.mocked(fetchPageCopy).mockImplementation(down)
    const meta = await generateMetadata(params('aliexpress'))
    expect(meta.title).toBe('Chollos de AliExpress hoy: 2 ofertas · PatoBarato')
    expect(meta.robots).toBeUndefined()
  })

  it('is still noindex with 2 deals when the copy row is absent', async () => {
    vi.mocked(fetchPageCopy).mockResolvedValue(null)
    expect((await generateMetadata(params('aliexpress'))).robots).toEqual({ index: false, follow: true })
  })

  it('hands the intro and FAQ to the client as server-rendered slots, never the raw copy', async () => {
    vi.mocked(fetchPageCopy).mockResolvedValue(copy({ faq: [{ q: '¿Envía a España?', aMd: 'Sí.' }] }))
    const client = propsOf(await StorePage(params('aliexpress')), StoreClient)
    expect((client.intro as { type: unknown }).type).toBe(PageIntro)
    expect((client.faq as { type: unknown }).type).toBe(PageFaq)
    const keys = payloadKeys(client)
    for (const key of ['introMd', 'aMd', 'copy']) expect(keys.has(key)).toBe(false)
  })

  it('reads the next event together with the other secondary reads', async () => {
    let eventsStarted = false
    vi.mocked(fetchEvents).mockImplementation(async () => {
      eventsStarted = true
      return []
    })
    vi.mocked(fetchDeals).mockImplementation(async () => {
      // Still inside the loader's Promise.all: events must already have been requested.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(eventsStarted).toBe(true)
      return { deals: [deal(1)], hasMore: false }
    })
    await generateMetadata(params('aliexpress'))
    expect(fetchEvents).toHaveBeenCalledTimes(1)
  })

  it('rejects (never 404 or noindex) when the deals read fails', async () => {
    vi.mocked(fetchDeals).mockImplementation(down)
    await expect(generateMetadata(params('aliexpress'))).rejects.toThrow('down')
    await expect(StorePage(params('aliexpress'))).rejects.toThrow('down')
  })

  it('links the next event within the announce window and survives an events failure', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'))
    try {
      vi.mocked(fetchEvents).mockResolvedValue([siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' })])
      const { unmount } = render(await StorePage(params('aliexpress')))
      expect(screen.getByRole('link', { name: 'Black Friday 2026' })).toHaveAttribute('href', '/eventos/black-friday')
      unmount()
      vi.mocked(fetchEvents).mockImplementation(down)
      render(await StorePage(params('aliexpress')))
      expect(screen.queryByText(/Próximo evento/)).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('renders the heading, the real counts and the breadcrumb JSON-LD', async () => {
    const { container } = render(await StorePage(params('aliexpress')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chollos de AliExpress')
    expect(screen.getByText('AliExpress · 2 chollos · 1 cupón')).toBeInTheDocument()
    const ld = [...container.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent).join()
    expect(ld).toContain('/tiendas/aliexpress')
    expect(ld).toContain('BreadcrumbList')
  })

  it('falls back to the first-page length when the store stats fail and there are no more pages', async () => {
    vi.mocked(fetchStores).mockImplementation(down)
    vi.mocked(fetchDeals).mockResolvedValue({ deals: [deal(1), deal(2), deal(3)], hasMore: false })
    expect((await generateMetadata(params('aliexpress'))).robots).toBeUndefined()
    render(await StorePage(params('aliexpress')))
    expect(screen.getByText('AliExpress · 3 chollos · 0 cupones')).toBeInTheDocument()
  })

  it('omits the coupon count when stats and coupons both fail', async () => {
    vi.mocked(fetchStores).mockImplementation(down)
    vi.mocked(fetchCoupons).mockImplementationOnce(down)
    render(await StorePage(params('aliexpress')))
    expect(screen.getByText('AliExpress · 1 chollo')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/0 cupones/)
  })
})
