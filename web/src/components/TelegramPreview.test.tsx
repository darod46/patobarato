import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { Deal } from '../lib/types'
import { TelegramPreview } from './TelegramPreview'

const full: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 80,
  previousPrice: 100,
  coupon: 'AHORRA5',
  hashtags: ['sony', 'audio'],
  affiliateUrl: 'https://amzn.to/x',
  title: 'Auriculares Sony',
  imageUrl: null,
  asin: 'A1',
  country: 'es',
}

it('shows every caption line in order plus the button', () => {
  const { container } = render(<TelegramPreview deal={full} />)
  const lines = Array.from(container.querySelectorAll('[data-line]')).map((n) => n.textContent)
  expect(lines).toEqual([
    '🦆 Auriculares Sony',
    '✅ Precio: 80,00 €',
    '❌ Antes: 100,00 € (-20%)',
    '🎟️ Cupón: AHORRA5',
    '#sony #audio',
  ])
  const link = screen.getByRole('link', { name: '🛒 Ver en Amazon' })
  expect(link).toHaveAttribute('href', 'https://amzn.to/x')
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
})

it('shows only title, price and button for a minimal deal', () => {
  const { container } = render(
    <TelegramPreview deal={{ ...full, previousPrice: null, coupon: null, hashtags: [] }} />,
  )
  const lines = Array.from(container.querySelectorAll('[data-line]')).map((n) => n.textContent)
  expect(lines).toEqual(['🦆 Auriculares Sony', '✅ Precio: 80,00 €'])
  expect(screen.getByRole('link', { name: '🛒 Ver en Amazon' })).toBeInTheDocument()
})
