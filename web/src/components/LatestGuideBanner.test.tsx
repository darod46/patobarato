import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LatestGuideBanner } from './LatestGuideBanner'
import type { GuideSummary } from '../lib/types'

const NOW = new Date('2026-11-25T10:00:00Z')
const guide: GuideSummary = {
  slug: 'freidoras-de-aire-menos-100',
  title: 'Freidoras de aire por menos de 100 €',
  subtitle: 'Cinco freidoras comparadas.',
  category: 'Hogar',
  author: 'el Pato',
  readingMinutes: 5,
  publishedAt: '2026-11-23T06:00:00Z',
  updatedAt: '2026-11-23T06:00:00Z',
  items: 5,
  pricesCheckedAt: null,
}

describe('LatestGuideBanner', () => {
  it('links to the guide with its cover, category, title, subtitle and publish date', () => {
    render(<LatestGuideBanner guide={guide} now={NOW} />)
    expect(screen.getByText('Última guía · Hogar')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: guide.title })).toBeInTheDocument()
    expect(screen.getByText('Cinco freidoras comparadas.')).toBeInTheDocument()
    expect(screen.getByText(/hace 2 días/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Leer la guía/ })).toHaveAttribute('href', '/guias/freidoras-de-aire-menos-100')
    expect(document.querySelector('img')).toHaveAttribute('src', '/guias/freidoras-de-aire-menos-100.jpeg')
  })
  it('renders without an image when the guide has no cover', () => {
    render(<LatestGuideBanner guide={{ ...guide, slug: 'sin-portada', subtitle: null }} now={NOW} />)
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByRole('link', { name: /Leer la guía/ })).toHaveAttribute('href', '/guias/sin-portada')
  })
})
