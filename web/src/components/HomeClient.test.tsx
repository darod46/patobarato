import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { HomeClient } from './HomeClient'
import type { Deal } from '../lib/types'

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

const deals = (n: number): Deal[] =>
  Array.from({ length: n }, (_, i) => ({ ...deal, publicationId: i + 1, asin: `A${i + 1}`, title: `Chollo ${i + 1}` }))

const props = {
  now: '2026-11-04T12:00:00Z',
  fetchLatestDeal: vi.fn().mockResolvedValue(deal),
}

it('renders header, hero, carousel, telegram block and footer', () => {
  render(<HomeClient {...props} deals={[deal]} />)
  expect(within(screen.getByRole('banner')).getByRole('img', { name: 'PatoBarato' })).toBeInTheDocument()
  expect(within(screen.getByRole('banner')).getByRole('link', { name: /Buscar chollos/ })).toHaveAttribute('href', '/buscar')
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Unirme al canal' })).toHaveAttribute(
    'href',
    'https://t.me/patobarato',
  )
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/chollos/)
  expect(screen.getByRole('heading', { name: 'Chollos de hoy' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Últimos chollos' })).toBeInTheDocument()
  expect(screen.getAllByText(/Auriculares Sony/).length).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: 'Ver todos los chollos' })).toHaveAttribute('href', '/chollos')
  expect(screen.getByText('© 2026 PatoBarato')).toBeInTheDocument()
  expect(
    screen.getByText(
      'En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables.',
    ),
  ).toBeInTheDocument()
})

it('does not render the filterable feed on the home', () => {
  render(<HomeClient {...props} deals={deals(5)} stores={[{ store: 'amazon', deals: 3, coupons: 0 }, { store: 'aliexpress', deals: 2, coupons: 1 }]} />)
  expect(screen.queryByRole('group', { name: /ordenar/i })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Cargar más chollos' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Todas' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'Todos' })).toBeNull()
})

it('shows at most 5 deals in the carousel', () => {
  render(<HomeClient {...props} deals={deals(8)} />)
  const region = screen.getByRole('region', { name: 'Últimos chollos' })
  expect(within(region).getAllByRole('link')).toHaveLength(5)
})

it('still renders the page shell and an honest message when there are no deals', () => {
  render(<HomeClient now="2026-11-04T12:00:00Z" fetchLatestDeal={vi.fn().mockResolvedValue(null)} />)
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(screen.getByText('Ahora mismo no podemos cargar los chollos')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ver todos los chollos' })).toHaveAttribute('href', '/chollos')
  expect(screen.getByText(/En calidad de Afiliado de Amazon/)).toBeInTheDocument()
})

it('contains none of the mockup invented claims', () => {
  const { container } = render(<HomeClient {...props} deals={[deal]} />)
  for (const bad of ['36.2K', 'Keepa', '0% Estafas', '180 Días']) {
    expect(container.textContent).not.toContain(bad)
  }
})

it('server-renders the carousel deals', () => {
  const html = renderToString(<HomeClient {...props} deals={deals(2)} />)
  expect(html).toContain('Chollo 1')
  expect(html).toContain('Chollo 2')
})

it('mounts the v3 sections in order and omits coupons when there are none', () => {
  const { container, unmount } = render(
    <HomeClient
      now="2026-11-06T10:00:00Z"
      fetchLatestDeal={vi.fn().mockResolvedValue(null)}
      coupons={[]}
      event={{ id: 'a', name: '11.11 de AliExpress', date: '2026-11-11', stores: ['aliexpress'] }}
      upcoming={[{ id: 'a', name: '11.11 de AliExpress', date: '2026-11-11', stores: ['aliexpress'] }]}
      latestPublishedAt="2026-11-06T09:48:00Z"
    />,
  )
  const ids = [...container.querySelectorAll('section[id]')].map((s) => s.id)
  expect(ids).toEqual(['chollos', 'como-funciona', 'eventos', 'sobre', 'telegram'])
  expect(screen.getByText(/11\.11 de AliExpress en 5 días/)).toBeInTheDocument()
  unmount()
  render(
    <HomeClient
      now="2026-11-06T10:00:00Z"
      fetchLatestDeal={vi.fn().mockResolvedValue(null)}
      coupons={[{ id: 1, store: 'aliexpress', code: 'PATO6', title: '−6 € en 40 €', conditions: null, url: null, startsAt: '2026-11-01T00:00:00Z', expiresAt: null, discountAmount: null, discountPct: null, minPurchase: null }]}
      stores={[{ store: 'aliexpress', deals: 2, coupons: 1 }]}
      event={null}
      upcoming={[]}
    />,
  )
  expect(document.querySelector('section#cupones')).not.toBeNull()
  expect(screen.getByText(/Algunos enlaces a AliExpress pueden ser de afiliado/)).toBeInTheDocument()
})

it('shows the stores block only with two or more stores', () => {
  const base = { ...props, event: null, upcoming: [] }
  const one = render(<HomeClient {...base} stores={[{ store: 'amazon', deals: 3, coupons: 0 }]} />)
  expect(document.querySelector('section#tiendas')).toBeNull()
  one.unmount()
  render(<HomeClient {...base} stores={[{ store: 'amazon', deals: 3, coupons: 0 }, { store: 'aliexpress', deals: 2, coupons: 1 }]} />)
  expect(document.querySelector('section#tiendas')).not.toBeNull()
  expect(screen.getByText(/^Amazon y AliExpress\. Cada oferta/)).toBeInTheDocument()
})
