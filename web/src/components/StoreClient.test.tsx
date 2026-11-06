import { act, render, screen, waitFor } from '@testing-library/react'
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

it('searches within the store', async () => {
  history.replaceState(null, '', '/tiendas/aliexpress')
  const fetchDeals = setup(vi.fn().mockResolvedValue({ deals: [], hasMore: false }))
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar chollos' }), 'lego')
  await waitFor(() =>
    expect(fetchDeals).toHaveBeenCalledWith({ q: 'lego', tag: undefined, store: 'aliexpress', sort: 'recientes', page: 0 }),
  )
})

it('uses singular forms and 0 when the store has no stats row', () => {
  render(
    <StoreClient
      store="decathlon"
      now="2026-11-04T12:00:00Z"
      initialTags={[]}
      stores={[{ store: 'amazon', deals: 1, coupons: 1 }, { store: 'decathlon', deals: 1, coupons: 1 }]}
      coupons={[]}
      fetchDeals={vi.fn().mockResolvedValue({ deals: [], hasMore: false })}
    />,
  )
  expect(screen.getByText('Decathlon · 1 chollo · 1 cupón')).toBeInTheDocument()
})
