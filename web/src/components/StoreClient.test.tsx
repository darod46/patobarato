import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { Coupon, Deal } from '../lib/types'
import { StoreClient } from './StoreClient'

const deal = (id: number): Deal => ({
  publicationId: id,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: ['hogar'],
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

const coupon: Coupon = {
  id: 1,
  store: 'aliexpress',
  code: 'PATO6',
  title: '−6 € en 40 €',
  conditions: null,
  url: null,
  startsAt: '2026-11-01T00:00:00Z',
  expiresAt: null,
  discountAmount: null, discountPct: null, minPurchase: null, eventId: null,
}

const stores = [
  { store: 'amazon', deals: 5, coupons: 0 },
  { store: 'aliexpress', deals: 12, coupons: 3 },
]

function setup(fetchDeals = vi.fn().mockResolvedValue({ deals: [deal(2)], hasMore: false })) {
  render(
    <StoreClient
      store="aliexpress"
      now="2026-11-04T12:00:00Z"
      initialDeals={{ q: '', tag: null, store: 'aliexpress', sort: 'recientes', deals: [deal(1)], hasMore: true }}
      initialTags={['hogar']}
      stores={stores}
      coupons={[coupon]}
      fetchDeals={fetchDeals}
    />,
  )
  return fetchDeals
}

afterEach(() => history.replaceState(null, '', '/'))

it('renders the header with real counts, the store coupons and the initial cards without fetching', async () => {
  const fetchDeals = setup()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chollos de AliExpress')
  expect(screen.getByText('AliExpress · 12 chollos · 3 cupones')).toBeInTheDocument()
  expect(screen.getByText('PATO6')).toBeInTheDocument()
  expect(screen.getByText('Chollo 1')).toBeInTheDocument()
  await act(async () => {})
  expect(fetchDeals).not.toHaveBeenCalled()
})

it('loads more with the store fixed and ignores ?tienda=', async () => {
  history.replaceState(null, '', '/tiendas/aliexpress?tienda=amazon')
  const fetchDeals = setup()
  await userEvent.click(screen.getByRole('button', { name: 'Cargar más chollos' }))
  expect(await screen.findByText('Chollo 2')).toBeInTheDocument()
  expect(fetchDeals).toHaveBeenCalledWith({ q: undefined, tag: undefined, store: 'aliexpress', sort: 'recientes', page: 1 })
})

it('has no search field; the header links to /buscar', () => {
  setup()
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.getByRole('link', { name: /Buscar chollos/ })).toHaveAttribute('href', '/buscar')
})

const noStats = (initialDeals?: { deals: Deal[]; hasMore: boolean }, ...rest: [coupons?: Coupon[] | undefined]) =>
  render(
    <StoreClient
      store="decathlon"
      now="2026-11-04T12:00:00Z"
      initialDeals={initialDeals && { q: '', tag: null, store: 'decathlon', sort: 'recientes', ...initialDeals }}
      initialTags={[]}
      stores={[{ store: 'amazon', deals: 1, coupons: 1 }]}
      coupons={rest.length ? rest[0] : []}
      fetchDeals={vi.fn().mockResolvedValue({ deals: [], hasMore: false })}
    />,
  )

it('uses singular forms with the stats row', () => {
  render(
    <StoreClient
      store="decathlon"
      now="2026-11-04T12:00:00Z"
      initialTags={[]}
      stores={[{ store: 'decathlon', deals: 1, coupons: 1 }]}
      coupons={[]}
      fetchDeals={vi.fn().mockResolvedValue({ deals: [], hasMore: false })}
    />,
  )
  expect(screen.getByText('Decathlon · 1 chollo · 1 cupón')).toBeInTheDocument()
})

it('without stats counts the loaded coupons and the deals only when the first page is complete', () => {
  noStats({ deals: [deal(1), deal(2)], hasMore: false }, [coupon])
  expect(screen.getByText('Decathlon · 2 chollos · 1 cupón')).toBeInTheDocument()
})

it('without stats and with more pages, never claims a deal count', () => {
  noStats({ deals: [deal(1)], hasMore: true }, [coupon])
  expect(screen.getByText('Decathlon · 1 cupón')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/0 chollos/)
})

it('without stats and with loaded coupons but no deals shows only the coupon count', () => {
  noStats(undefined, [])
  expect(document.body.textContent).not.toMatch(/0 chollos/)
  expect(screen.getByText(/^Decathlon · 0 cupones$/)).toBeInTheDocument()
})

it('without stats and with coupons that failed to load shows no counts at all', () => {
  noStats(undefined, undefined)
  expect(screen.getByText(/^Decathlon$/)).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/0 cupones|0 chollos/)
})

it('without stats omits the coupon count when the list may be truncated', () => {
  const many = Array.from({ length: 50 }, (_, i) => ({ ...coupon, id: i + 1 }))
  noStats({ deals: [deal(1)], hasMore: false }, many)
  expect(screen.getByText(/^Decathlon · 1 chollo$/)).toBeInTheDocument()
})
