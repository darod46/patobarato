import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { HashtagClient } from './HashtagClient'

const deal = (id: number): Deal => ({
  publicationId: id,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: ['niños'],
  affiliateUrl: 'https://amzn.to/x',
  title: `Chollo ${id}`,
  imageUrl: null,
  asin: `B00000000${id}`,
  country: 'es',
  store: 'amazon',
  productId: id,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
})

function setup(fetchDeals = vi.fn().mockResolvedValue({ deals: [deal(2)], hasMore: false })) {
  render(
    <HashtagClient
      tag="niños"
      now="2026-11-04T12:00:00Z"
      initialDeals={{ q: '', tag: 'niños', deals: [deal(1)], hasMore: true }}
      initialTags={['hogar', 'niños']}
      fetchDeals={fetchDeals}
    />,
  )
  return fetchDeals
}

afterEach(() => history.replaceState(null, '', '/'))

it('renders the heading, initial cards and link chips without fetching', async () => {
  const fetchDeals = setup()
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Chollos de #niños')
  expect(screen.getByText('Chollo 1')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '#niños' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: '#hogar' })).toHaveAttribute('href', '/chollos/hogar')
  expect(screen.getByRole('link', { name: 'Todos' })).toHaveAttribute('href', '/')
  expect(screen.getByText(/En calidad de Afiliado de Amazon/)).toBeInTheDocument()
  await act(async () => {})
  expect(fetchDeals).not.toHaveBeenCalled()
})

it('loads more within the tag', async () => {
  const fetchDeals = setup()
  await userEvent.click(screen.getByRole('button', { name: 'Cargar más chollos' }))
  expect(await screen.findByText('Chollo 2')).toBeInTheDocument()
  expect(fetchDeals).toHaveBeenCalledWith({ q: undefined, tag: 'niños', sort: 'recientes', page: 1 })
})

it('searches within the tag and clears the search', async () => {
  history.replaceState(null, '', '/chollos/ni%C3%B1os')
  const fetchDeals = setup(vi.fn().mockResolvedValue({ deals: [], hasMore: false }))
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar chollos' }), 'lego')
  await waitFor(() => expect(fetchDeals).toHaveBeenCalledWith({ q: 'lego', tag: 'niños', sort: 'recientes', page: 0 }))
  expect(window.location.pathname + window.location.search).toBe('/chollos/ni%C3%B1os?q=lego')
  await userEvent.click(await screen.findByRole('button', { name: 'Quitar filtros' }))
  await waitFor(() => expect(window.location.search).toBe(''))
  await waitFor(() => expect(fetchDeals).toHaveBeenLastCalledWith({ q: undefined, tag: 'niños', sort: 'recientes', page: 0 }))
})
