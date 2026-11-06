import { act, render, screen, waitFor, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
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

function setup() {
  return render(
    <HomeClient
      now="2026-11-04T12:00:00Z"
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
  expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Unirme al canal' })).toHaveAttribute(
    'href',
    'https://t.me/patobarato',
  )
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/chollos/)
  expect(screen.getByRole('heading', { name: 'Chollos de hoy' })).toBeInTheDocument()
  expect(screen.getByText('© 2026 PatoBarato')).toBeInTheDocument()
  await waitFor(() => expect(screen.getAllByText(/Auriculares Sony/).length).toBeGreaterThan(1))
  expect(
    screen.getByText(
      'En calidad de Afiliado de Amazon, PatoBarato obtiene ingresos por las compras adscritas que cumplen los requisitos aplicables.',
    ),
  ).toBeInTheDocument()
})

it('still renders the page shell and an error state when env vars are missing', async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  try {
    render(<HomeClient now="2026-11-04T12:00:00Z" />)
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

it('hydrates server HTML without mismatches and then applies the URL filters', async () => {
  const props = {
    now: '2026-11-04T12:00:00Z',
    fetchDeals: vi.fn().mockResolvedValue({ deals: [deal], hasMore: false }),
    fetchHashtags: vi.fn().mockResolvedValue([{ tag: 'sony', count: 1 }]),
    fetchLatestDeal: vi.fn().mockResolvedValue(deal),
  }
  const container = document.createElement('div')
  // A static page is rendered on the server without the visitor's query string.
  container.innerHTML = renderToString(<HomeClient {...props} />)
  history.replaceState(null, '', '/?q=lego&tag=sony')
  document.body.appendChild(container)
  const onRecoverableError = vi.fn()
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  let root: Root | undefined
  try {
    await act(async () => {
      root = hydrateRoot(container, <HomeClient {...props} />, { onRecoverableError })
    })
    expect(screen.getByRole('searchbox', { name: 'Buscar chollos' })).toHaveValue('lego')
    await waitFor(() =>
      expect(props.fetchDeals).toHaveBeenLastCalledWith({ q: 'lego', tag: 'sony', sort: 'recientes', page: 0 }),
    )
    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  } finally {
    act(() => root?.unmount())
    container.remove()
    errors.mockRestore()
    history.replaceState(null, '', '/')
  }
})

it('server-renders the initial page and hydrates without refetching it', async () => {
  const props = {
    now: '2026-11-04T12:00:00Z',
    initialDeals: { q: '', tag: null, deals: [deal], hasMore: false },
    initialTags: ['sony'],
    fetchDeals: vi.fn().mockResolvedValue({ deals: [], hasMore: false }),
    fetchHashtags: vi.fn().mockResolvedValue([]),
    fetchLatestDeal: vi.fn().mockResolvedValue(null),
  }
  const container = document.createElement('div')
  container.innerHTML = renderToString(<HomeClient {...props} />)
  expect(container.textContent).toContain('Auriculares Sony')
  expect(container.textContent).toContain('#sony')
  document.body.appendChild(container)
  const onRecoverableError = vi.fn()
  let root: Root | undefined
  try {
    await act(async () => {
      root = hydrateRoot(container, <HomeClient {...props} />, { onRecoverableError })
    })
    expect(screen.getByText('Auriculares Sony')).toBeInTheDocument()
    expect(props.fetchDeals).not.toHaveBeenCalled()
    expect(props.fetchHashtags).not.toHaveBeenCalled()
    expect(onRecoverableError).not.toHaveBeenCalled()
  } finally {
    act(() => root?.unmount())
    container.remove()
  }
})

it('fetches the URL filters after hydrating even with initial data', async () => {
  history.replaceState(null, '', '/?tag=sony')
  const fetchDeals = vi.fn().mockResolvedValue({ deals: [], hasMore: false })
  try {
    render(
      <HomeClient
        now="2026-11-04T12:00:00Z"
        initialDeals={{ q: '', tag: null, deals: [deal], hasMore: false }}
        initialTags={['sony']}
        fetchDeals={fetchDeals}
        fetchLatestDeal={vi.fn().mockResolvedValue(null)}
      />,
    )
    await waitFor(() => expect(fetchDeals).toHaveBeenCalledWith({ q: undefined, tag: 'sony', sort: 'recientes', page: 0 }))
    expect(fetchDeals).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('No hay chollos con esos filtros')).toBeInTheDocument()
  } finally {
    history.replaceState(null, '', '/')
  }
})

it('renders crawlable link chips and marks a legacy ?tag= as current', async () => {
  history.replaceState(null, '', '/?tag=sony')
  try {
    render(
      <HomeClient
        now="2026-11-04T12:00:00Z"
        initialDeals={{ q: '', tag: null, deals: [deal], hasMore: false }}
        initialTags={['sony', 'hogar']}
        fetchDeals={vi.fn().mockResolvedValue({ deals: [deal], hasMore: false })}
        fetchLatestDeal={vi.fn().mockResolvedValue(null)}
      />,
    )
    expect(screen.getByRole('link', { name: '#hogar' })).toHaveAttribute('href', '/chollos/hogar')
    expect(screen.getByRole('link', { name: '#sony' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Todos' })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: '#sony' })).not.toBeInTheDocument()
    await screen.findAllByText(/Auriculares Sony/)
  } finally {
    history.replaceState(null, '', '/')
  }
})

it('mounts the v3 sections in order and omits coupons when there are none', () => {
  const { container, unmount } = render(
    <HomeClient
      now="2026-11-06T10:00:00Z"
      fetchDeals={vi.fn().mockResolvedValue({ deals: [], hasMore: false })}
      fetchHashtags={vi.fn().mockResolvedValue([])}
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
      fetchDeals={vi.fn().mockResolvedValue({ deals: [], hasMore: false })}
      fetchHashtags={vi.fn().mockResolvedValue([])}
      fetchLatestDeal={vi.fn().mockResolvedValue(null)}
      coupons={[{ id: 1, store: 'aliexpress', code: 'PATO6', title: '−6 € en 40 €', conditions: null, url: null, startsAt: '2026-11-01T00:00:00Z', expiresAt: null }]}
      stores={[{ store: 'aliexpress', deals: 2, coupons: 1 }]}
      event={null}
      upcoming={[]}
    />,
  )
  expect(document.querySelector('section#cupones')).not.toBeNull()
  expect(screen.getByText(/programas de afiliados de AliExpress/)).toBeInTheDocument()
})

it('shows the stores block and store chips only with two or more stores', async () => {
  const props = {
    now: '2026-11-06T10:00:00Z',
    fetchDeals: vi.fn().mockResolvedValue({ deals: [deal], hasMore: false }),
    fetchHashtags: vi.fn().mockResolvedValue([]),
    fetchLatestDeal: vi.fn().mockResolvedValue(null),
    event: null,
    upcoming: [],
  }
  const one = render(<HomeClient {...props} stores={[{ store: 'amazon', deals: 3, coupons: 0 }]} />)
  expect(document.querySelector('section#tiendas')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Todas' })).toBeNull()
  one.unmount()
  render(
    <HomeClient {...props} stores={[{ store: 'amazon', deals: 3, coupons: 0 }, { store: 'aliexpress', deals: 2, coupons: 1 }]} />,
  )
  expect(document.querySelector('section#tiendas')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'AliExpress' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByText(/^Amazon y AliExpress\. Cada oferta/)).toBeInTheDocument()
  await screen.findAllByText(/Auriculares Sony/)
})
