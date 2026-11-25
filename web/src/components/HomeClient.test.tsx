import { render, screen, within } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { HomeClient } from './HomeClient'
import type { Deal } from '../lib/types'
import { siteEvent } from '../test-utils/siteEvent'

const deal: Deal = {
  publicationId: 1, status: 'active', endedAt: null,
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
  priceBeforeCoupon: false,
}

const deals = (n: number): Deal[] =>
  Array.from({ length: n }, (_, i) => ({ ...deal, publicationId: i + 1, asin: `A${i + 1}`, title: `Chollo ${i + 1}` }))

const ali = siteEvent({ id: 1, slug: 'aliexpress-1111', name: '11.11 de AliExpress', startsOn: '2026-11-11', stores: ['aliexpress'] })

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
      event={ali}
      upcoming={[ali]}
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
      coupons={[{ id: 1, store: 'aliexpress', code: 'PATO6', title: '−6 € en 40 €', conditions: null, url: null, startsAt: '2026-11-01T00:00:00Z', expiresAt: null, discountAmount: null, discountPct: null, minPurchase: null, eventId: null }]}
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

it('renders no bar and no calendar when no events are given', () => {
  const { container } = render(<HomeClient {...props} />)
  expect(screen.queryByText(/ en \d+ días/)).toBeNull()
  expect(screen.queryByText('Calendario de chollos')).toBeNull()
  expect(container.querySelector('section#eventos')).toBeNull()
})

it('passes the live channel data to the Telegram block and the hero', () => {
  const live = {
    stats: { members: 12400, checkedAt: '2026-11-04T11:00:00Z', postedToday: 3, lastPostedAt: '2026-11-04T11:50:00Z' },
    posts: [{ productId: 1, title: 'Freidora Cosori', price: 79, messageId: 55, publishedAt: '2026-11-04T11:50:00Z' }],
  }
  // The server render uses the page's render time, so hydration matches.
  const html = renderToString(<HomeClient {...props} live={live} />)
  expect(html).toContain('Último chollo hace 10 min')
  render(<HomeClient {...props} live={live} />)
  expect(screen.getByText('12.400 suscriptores · gratis')).toBeInTheDocument()
  expect(screen.getByText('3 chollos hoy')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Freidora Cosori/ })).toHaveAttribute('href', 'https://t.me/patobarato/55')
})

it('renders no live channel data without it', () => {
  render(<HomeClient {...props} live={null} />)
  expect(screen.queryByText(/suscriptores|chollos hoy|Último chollo|Últimos en el canal/)).toBeNull()
})

it('passes the event in progress to the hero', () => {
  const bf = siteEvent({ id: 2, slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' })
  render(<HomeClient {...props} now="2026-11-28T10:00:00Z" event={bf} upcoming={[bf]} activeEvent={bf} />)
  expect(screen.getByRole('link', { name: 'Chollos del Black Friday' })).toHaveAttribute('href', '/eventos/black-friday')
})

it('shows the latest guide banner only when a guide is given', () => {
  const guide = {
    slug: 'freidoras-de-aire-menos-100',
    title: 'Freidoras de aire por menos de 100 €',
    subtitle: null,
    category: 'Hogar',
    author: 'el Pato',
    readingMinutes: 5,
    publishedAt: '2026-11-23T06:00:00Z',
    updatedAt: '2026-11-23T06:00:00Z',
    items: 5,
    pricesCheckedAt: null,
  }
  render(<HomeClient {...props} latestGuide={guide} />)
  expect(screen.getByRole('link', { name: /Leer la guía/ })).toHaveAttribute('href', '/guias/freidoras-de-aire-menos-100')
})

it('renders no guide banner without a latest guide', () => {
  render(<HomeClient {...props} />)
  expect(screen.queryByRole('link', { name: /Leer la guía/ })).toBeNull()
})
