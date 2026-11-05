import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { formatPrice } from '../lib/format'
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
}

const minimal: Deal = {
  ...full,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  imageUrl: null,
}

describe('DealCard', () => {
  it('renders a full deal', () => {
    render(<DealCard deal={full} now={now} onTagClick={() => {}} />)
    expect(screen.getByText('Auriculares Sony')).toBeInTheDocument()
    expect(screen.getByText(formatPrice(29.99), { normalizer: (t) => t })).toBeInTheDocument()
    const prev = screen.getByText(formatPrice(49.99), { normalizer: (t) => t })
    expect(prev.tagName).toBe('S')
    expect(screen.getByText('-40%')).toBeInTheDocument()
    expect(screen.getByText('Cupón 5 €')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#sony' })).toBeInTheDocument()
    expect(screen.getByText('hace 5 min')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Ver en Amazon/ })
    expect(link).toHaveAttribute('href', full.affiliateUrl)
    expect(link).toHaveAttribute('target', '_blank')
    const rel = link.getAttribute('rel') ?? ''
    for (const token of ['sponsored', 'noopener', 'noreferrer']) expect(rel).toContain(token)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', full.imageUrl)
    expect(img).toHaveAttribute('alt', full.title)
    expect(img).not.toHaveAttribute('data-placeholder')
  })

  it('renders a minimal deal with placeholder', () => {
    const { container } = render(<DealCard deal={minimal} now={now} onTagClick={() => {}} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/pato-placeholder.svg')
    expect(screen.getByRole('img')).toHaveAttribute('data-placeholder', 'true')
    expect(container.textContent).not.toContain('%')
    expect(container.querySelector('s')).toBeNull()
    expect(screen.queryByTestId('coupon')).toBeNull()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('falls back to the placeholder when the image fails', () => {
    render(<DealCard deal={full} now={now} onTagClick={() => {}} />)
    const img = screen.getByRole('img')
    img.dispatchEvent(new Event('error'))
    return vi.waitFor(() => expect(img).toHaveAttribute('src', '/pato-placeholder.svg'))
  })

  it('calls onTagClick with the tag', async () => {
    const onTagClick = vi.fn()
    render(<DealCard deal={full} now={now} onTagClick={onTagClick} />)
    await userEvent.click(screen.getByRole('button', { name: '#sony' }))
    expect(onTagClick).toHaveBeenCalledWith('sony')
  })
})

describe('DealCard Amazon button on mobile', () => {
  it('opens in the same tab on iPhone so iOS can hand it to the Amazon app', () => {
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')
    try {
      render(<DealCard deal={full} now={now} onTagClick={() => {}} />)
      const link = screen.getByRole('link', { name: /Ver en Amazon/ })
      expect(link).not.toHaveAttribute('target')
      expect(link).toHaveAttribute('href', full.affiliateUrl)
    } finally {
      ua.mockRestore()
    }
  })
})

describe('DealCard server render', () => {
  it('renders the desktop link on the server whatever the browser, so hydration matches', () => {
    const ua = vi
      .spyOn(navigator, 'userAgent', 'get')
      .mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')
    try {
      const html = renderToString(<DealCard deal={full} now={now} onTagClick={() => {}} />)
      expect(html).toContain('target="_blank"')
    } finally {
      ua.mockRestore()
    }
  })
})
