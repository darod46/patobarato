import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { HashtagClient } from './HashtagClient'
import { PageFaq, PageIntro } from './PageIntro'

const deal = (id: number): Deal => ({
  publicationId: id, status: 'active', endedAt: null,
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
  priceBeforeCoupon: false,
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
  expect(screen.getByRole('link', { name: 'Todos' })).toHaveAttribute('href', '/chollos')
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

it('has no search field; the header links to /buscar', () => {
  setup()
  expect(screen.queryByRole('searchbox')).toBeNull()
  expect(screen.getByRole('link', { name: /Buscar chollos/ })).toHaveAttribute('href', '/buscar')
})


const event = {
  id: 1, slug: 'black-friday', name: 'Black Friday', stores: [], startsOn: '2026-11-27', endsOn: '2026-11-29',
  approximate: false, hashtags: [], aliexpressPromo: null, introMd: '', tipsMd: '', faq: [], updatedAt: '2026-11-01T00:00:00Z',
}

it('renders the server intro slot (h1, intro, next event) and the FAQ slot after the deals', () => {
  render(
    <HashtagClient
      tag="tecnologia"
      now="2026-11-04T12:00:00Z"
      initialDeals={{ q: '', tag: 'tecnologia', deals: [deal(1)], hasMore: false }}
      initialTags={[]}
      intro={
        <PageIntro
          h1="Chollos de tecnología"
          copy={{ kind: 'category', slug: 'tecnologia', title: 'T', h1: 'Chollos de tecnología', introMd: 'Hoy hay {deals} chollos de tecnología.', faq: [], updatedAt: '2026-11-01T00:00:00Z' }}
          values={{ deals: 12 }}
          nextEvent={event}
        />
      }
      faq={<PageFaq faq={[{ q: '¿Cada cuánto?', aMd: 'Cada hora.' }]} />}
    />,
  )
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  expect(screen.getByRole('heading', { level: 1, name: 'Chollos de tecnología' })).toBeInTheDocument()
  expect(screen.getByText('Hoy hay 12 chollos de tecnología.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Black Friday 2026' })).toHaveAttribute('href', '/eventos/black-friday')
  expect(screen.queryByText('Se actualiza automáticamente')).toBeNull()
  const faq = screen.getByText('¿Cada cuánto?')
  expect(screen.getByText(deal(1).title).compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('without an intro slot renders the plain h1 and the caption', () => {
  render(
    <HashtagClient
      tag="tecnologia"
      now="2026-11-04T12:00:00Z"
      initialDeals={{ q: '', tag: 'tecnologia', deals: [deal(1)], hasMore: false }}
      initialTags={[]}
    />,
  )
  expect(screen.getByRole('heading', { level: 1, name: 'Chollos de #tecnologia' })).toBeInTheDocument()
  expect(screen.getByText('Se actualiza automáticamente')).toBeInTheDocument()
})
