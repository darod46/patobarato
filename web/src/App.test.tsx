import { render, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import App from './App'
import type { Deal } from './lib/types'

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
}

function setup() {
  return render(
    <App
      now={new Date('2026-11-04T12:00:00Z')}
      fetchDeals={vi.fn().mockResolvedValue({ deals: [deal], hasMore: false })}
      fetchHashtags={vi.fn().mockResolvedValue([{ tag: 'sony', count: 1 }])}
      fetchLatestDeal={vi.fn().mockResolvedValue(deal)}
    />,
  )
}

it('renders header, hero, feed, telegram block and footer', async () => {
  setup()
  expect(within(screen.getByRole('banner')).getByRole('img', { name: 'PatoBarato' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: 'Buscar chollos' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Telegram' })).toHaveAttribute(
    'href',
    'https://t.me/patobarato',
  )
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/chollos/)
  expect(screen.getByRole('heading', { name: 'Chollos' })).toBeInTheDocument()
  await waitFor(() => expect(screen.getAllByText(/Auriculares Sony/).length).toBeGreaterThan(1))
  expect(
    screen.getByText(
      'En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables.',
    ),
  ).toBeInTheDocument()
})

it('still renders the page shell and an error state when env vars are missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
  try {
    render(<App now={new Date('2026-11-04T12:00:00Z')} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/En calidad de Afiliado de Amazon/)).toBeInTheDocument()
  } finally {
    vi.unstubAllEnvs()
  }
})

it('contains none of the mockup invented claims', async () => {
  const { container } = setup()
  await waitFor(() => expect(screen.getAllByText(/Auriculares Sony/).length).toBeGreaterThan(0))
  for (const bad of ['36.2K', 'Keepa', '0% Estafas', '180 Días']) {
    expect(container.textContent).not.toContain(bad)
  }
})
