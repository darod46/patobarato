import { render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { DealsClient } from './DealsClient'

const deal: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 80,
  previousPrice: 100,
  coupon: null,
  hashtags: ['sony'],
  affiliateUrl: 'https://amzn.to/x',
  title: 'Auriculares Sony',
  imageUrl: null,
  asin: 'A1',
  country: 'es',
  store: 'amazon',
  productId: 1,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
}

afterEach(() => history.replaceState(null, '', '/'))

it('renders the H1, the subtitle, search, feed with sort and footer', async () => {
  render(
    <DealsClient
      now="2026-11-04T12:00:00Z"
      fetchDeals={vi.fn().mockResolvedValue({ deals: [deal], hasMore: true })}
      fetchHashtags={vi.fn().mockResolvedValue([{ tag: 'sony', count: 1 }])}
    />,
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
  expect(screen.getByText('Se actualiza automáticamente')).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByRole('searchbox', { name: 'Buscar chollos' })).toBeInTheDocument()
  expect(await screen.findByText('Auriculares Sony')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cargar más chollos' })).toBeInTheDocument()
  expect(await screen.findByRole('link', { name: '#sony' })).toHaveAttribute('href', '/chollos/sony')
  expect(screen.getByRole('link', { name: 'Todos' })).toHaveAttribute('href', '/chollos')
  expect(screen.getByText('© 2026 PatoBarato')).toBeInTheDocument()
})

it('reads the URL filters and shows store chips with two or more stores', async () => {
  history.replaceState(null, '', '/chollos?q=lego&tienda=aliexpress')
  const fetchDeals = vi.fn().mockResolvedValue({ deals: [], hasMore: false })
  render(
    <DealsClient
      now="2026-11-04T12:00:00Z"
      fetchDeals={fetchDeals}
      fetchHashtags={vi.fn().mockResolvedValue([])}
      stores={[{ store: 'amazon', deals: 3, coupons: 0 }, { store: 'aliexpress', deals: 2, coupons: 1 }]}
    />,
  )
  expect(screen.getByRole('searchbox', { name: 'Buscar chollos' })).toHaveValue('lego')
  await waitFor(() =>
    expect(fetchDeals).toHaveBeenLastCalledWith({ q: 'lego', tag: undefined, store: 'aliexpress', sort: 'recientes', page: 0 }),
  )
  expect(screen.getByRole('button', { name: 'AliExpress' })).toHaveAttribute('aria-pressed', 'true')
})

it('uses the server-rendered page without refetching it', async () => {
  const fetchDeals = vi.fn().mockResolvedValue({ deals: [], hasMore: false })
  const fetchHashtags = vi.fn().mockResolvedValue([])
  render(
    <DealsClient
      now="2026-11-04T12:00:00Z"
      initialDeals={{ q: '', tag: null, deals: [deal], hasMore: false }}
      initialTags={['sony']}
      fetchDeals={fetchDeals}
      fetchHashtags={fetchHashtags}
    />,
  )
  expect(screen.getByText('Auriculares Sony')).toBeInTheDocument()
  expect(fetchDeals).not.toHaveBeenCalled()
  expect(fetchHashtags).not.toHaveBeenCalled()
})

it('renders the shell and an error state when env vars are missing', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  try {
    render(<DealsClient now="2026-11-04T12:00:00Z" />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  } finally {
    vi.unstubAllEnvs()
  }
})
