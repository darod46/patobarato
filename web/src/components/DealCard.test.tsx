import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { formatPrice } from '../lib/format'
import { productPath } from '../lib/urls'
import { DealCard } from './DealCard'

const now = new Date('2026-11-04T12:00:00Z')

const full: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 29.99,
  previousPrice: 49.99,
  coupon: 'Cupón 5 €',
  hashtags: ['sony'],
  affiliateUrl: 'https://amzn.to/abc',
  title: 'Auriculares Sony',
  imageUrl: 'https://img.example/a.jpg',
  asin: 'B000000001',
  country: 'es',
  store: 'amazon',
  productId: 7,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
}

const minimal: Deal = {
  ...full,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  imageUrl: null,
}

describe('DealCard', () => {
  it('renders a full deal as a single link to the product page', () => {
    render(<DealCard deal={full} now={now} />)
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', productPath(full))
    expect(links[0]).toHaveAccessibleName(/Auriculares Sony/)
    expect(screen.getByText('Auriculares Sony')).toBeInTheDocument()
    expect(screen.getByText(formatPrice(29.99), { normalizer: (t) => t })).toBeInTheDocument()
    const prev = screen.getByText(formatPrice(49.99), { normalizer: (t) => t })
    expect(prev.tagName).toBe('S')
    expect(screen.getByText('-40%')).toBeInTheDocument()
    expect(screen.getByText('Cupón 5 €')).toBeInTheDocument()
    expect(screen.getByText('Amazon · hace 5 min')).toBeInTheDocument()
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', full.imageUrl)
    expect(img).toHaveAttribute('alt', full.title)
    expect(img).not.toHaveAttribute('data-placeholder')
  })

  it('has no Amazon button and no hashtag buttons', () => {
    const { container } = render(<DealCard deal={full} now={now} />)
    expect(container.textContent).not.toContain('Ver en Amazon')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(container.textContent).not.toContain('#sony')
  })

  it('renders a minimal deal with placeholder', () => {
    const { container } = render(<DealCard deal={minimal} now={now} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/pato-placeholder.svg')
    expect(screen.getByRole('img')).toHaveAttribute('data-placeholder', 'true')
    expect(container.textContent).not.toContain('%')
    expect(container.querySelector('s')).toBeNull()
    expect(screen.queryByTestId('coupon')).toBeNull()
  })

  it('falls back to the placeholder when the image fails', () => {
    render(<DealCard deal={full} now={now} />)
    const img = screen.getByRole('img')
    img.dispatchEvent(new Event('error'))
    return vi.waitFor(() => expect(img).toHaveAttribute('src', '/pato-placeholder.svg'))
  })
})
