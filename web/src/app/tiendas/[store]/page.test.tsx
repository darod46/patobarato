import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchDeals } from '../../../lib/deals'
import { fetchCoupons } from '../../../lib/coupons'
import { fetchStores } from '../../../lib/stores-data'
import type { Deal } from '../../../lib/types'
import StorePage, { generateMetadata } from './page'

const deal = (id: number): Deal => ({
  publicationId: id,
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
})

vi.mock('../../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../../lib/deals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/deals')>()),
  fetchDeals: vi.fn(),
  fetchHashtags: vi.fn(async () => []),
}))
vi.mock('../../../lib/coupons', () => ({ MAX_STORE_COUPONS: 50, fetchCoupons: vi.fn(async () => []) }))
vi.mock('../../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

const params = (store: string) => ({ params: Promise.resolve({ store }) })

beforeEach(() => {
  vi.mocked(fetchDeals).mockReset().mockResolvedValue({ deals: [deal(1)], hasMore: false })
  vi.mocked(fetchStores)
    .mockReset()
    .mockResolvedValue([
      { store: 'amazon', deals: 5, coupons: 0 },
      { store: 'aliexpress', deals: 2, coupons: 1 },
    ])
})

describe('StorePage', () => {
  it('404s for an unknown store, in the page and in the metadata', async () => {
    const page = await StorePage(params('fnac')).catch((e: unknown) => e)
    expect((page as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
    const meta = await generateMetadata(params('fnac')).catch((e: unknown) => e)
    expect((meta as { digest?: string }).digest).toBe('NEXT_HTTP_ERROR_FALLBACK;404')
  })

  it('is noindex with fewer than 3 deals and titled after the store', async () => {
    const meta = await generateMetadata(params('aliexpress'))
    expect(meta.title).toBe('Chollos de AliExpress · PatoBarato')
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  it('renders the heading, the real counts and the breadcrumb JSON-LD', async () => {
    const { container } = render(await StorePage(params('aliexpress')))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chollos de AliExpress')
    expect(screen.getByText('AliExpress · 2 chollos · 1 cupón')).toBeInTheDocument()
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(JSON.stringify(ld)).toContain('/tiendas/aliexpress')
    expect(JSON.stringify(ld)).toContain('BreadcrumbList')
  })

  it('falls back to the first-page length when the store stats fail and there are no more pages', async () => {
    vi.mocked(fetchStores).mockImplementation(async () => {
      throw new Error('down')
    })
    vi.mocked(fetchDeals).mockResolvedValue({ deals: [deal(1), deal(2), deal(3)], hasMore: false })
    expect((await generateMetadata(params('aliexpress'))).robots).toBeUndefined()
    render(await StorePage(params('aliexpress')))
    expect(screen.getByText('AliExpress · 3 chollos · 0 cupones')).toBeInTheDocument()
  })

  it('omits the coupon count when stats and coupons both fail', async () => {
    vi.mocked(fetchStores).mockImplementation(async () => {
      throw new Error('down')
    })
    vi.mocked(fetchCoupons).mockImplementationOnce(async () => {
      throw new Error('down')
    })
    render(await StorePage(params('aliexpress')))
    expect(screen.getByText('AliExpress · 1 chollo')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/0 cupones/)
  })
})
