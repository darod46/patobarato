import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GuideCard } from './GuideCard'
import type { GuideSummary } from '../lib/types'

const summary: GuideSummary = {
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

describe('GuideCard', () => {
  it('shows the cover above the title when the guide has one', () => {
    render(<GuideCard guide={summary} />)
    const img = document.querySelector('img')!
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('src', '/guias/freidoras-de-aire-menos-100.jpeg')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(screen.getByRole('link', { name: summary.title })).toHaveAttribute('href', '/guias/freidoras-de-aire-menos-100')
  })
  it('shows the product count, and omits it for a guide without products', () => {
    const { rerender } = render(<GuideCard guide={summary} />)
    expect(screen.getByText(/5 productos · actualizada el/)).toBeInTheDocument()
    rerender(<GuideCard guide={{ ...summary, items: 0 }} />)
    expect(screen.queryByText(/productos/)).toBeNull()
    expect(screen.getByText(/^Actualizada el/)).toBeInTheDocument()
  })
  it('renders without an image for a guide without cover', () => {
    render(<GuideCard guide={{ ...summary, slug: 'otra-guia' }} />)
    expect(document.querySelector('img')).toBeNull()
  })
})
