import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { DealCarousel } from './DealCarousel'

const now = new Date('2026-11-04T12:00:00Z')
const deal = (id: number): Deal => ({
  publicationId: id,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  affiliateUrl: 'https://amzn.to/x',
  title: `Chollo ${id}`,
  imageUrl: null,
  asin: `A${id}`,
  country: 'es',
  store: 'amazon',
  productId: id,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
})
const list = (n: number) => Array.from({ length: n }, (_, i) => deal(i + 1))

describe('DealCarousel', () => {
  it('shows at most the first 5 deals in a snap-scrolling region', () => {
    render(<DealCarousel deals={list(8)} now={now} />)
    const region = screen.getByRole('region', { name: 'Últimos chollos' })
    expect(region).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory')
    expect(within(region).getAllByRole('link')).toHaveLength(5)
    expect(within(region).queryByText('Chollo 6')).toBeNull()
    expect(within(region).getByText('Chollo 5')).toBeInTheDocument()
  })

  it('links to the full listing with a primary button', () => {
    render(<DealCarousel deals={list(2)} now={now} />)
    const link = screen.getByRole('link', { name: 'Ver todos los chollos' })
    expect(link).toHaveAttribute('href', '/chollos')
    expect(link).toHaveClass('min-h-12')
  })

  it('shows an honest message, no row and the button when there are no deals', () => {
    render(<DealCarousel deals={[]} now={now} />)
    expect(screen.getByText('Ahora mismo no podemos cargar los chollos')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Últimos chollos' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos los chollos' })).toHaveAttribute('href', '/chollos')
  })

  it('scrolls the row by one card with the previous and next buttons', async () => {
    const user = userEvent.setup()
    render(<DealCarousel deals={list(5)} now={now} />)
    const region = screen.getByRole('region', { name: 'Últimos chollos' })
    const scrollBy = vi.fn()
    region.scrollBy = scrollBy as unknown as typeof region.scrollBy
    const next = screen.getByRole('button', { name: 'Siguiente' })
    const prev = screen.getByRole('button', { name: 'Anterior' })
    expect(next).toHaveClass('size-11')
    await user.click(next)
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: 292 }))
    await user.click(prev)
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ left: -292 }))
  })
})
