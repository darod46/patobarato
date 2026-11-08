import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { formatPrice } from '../lib/format'
import type { Deal } from '../lib/types'
import { TelegramPreview } from './TelegramPreview'

const URL_ES = 'https://www.amazon.es/dp/A1?tag=patobarato-21'

const full: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 80,
  previousPrice: 100,
  coupon: 'AHORRA5',
  hashtags: ['sony', 'audio'],
  affiliateUrl: URL_ES,
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

it('shows every caption line in order, with the Amazon link as visible text', () => {
  const { container } = render(<TelegramPreview deal={full} />)
  const lines = Array.from(container.querySelectorAll('[data-line]')).map((n) => n.textContent)
  expect(lines).toEqual([
    'Auriculares Sony',
    `✅ Precio: ${formatPrice(80)}`,
    `❌ Antes: ${formatPrice(100)} (-20%)`,
    '🎟️ Cupón: AHORRA5',
    `🛒 Ver en Amazon: ${URL_ES}`,
    '#sony #audio',
  ])
  const link = screen.getByRole('link', { name: URL_ES })
  expect(link).toHaveAttribute('href', URL_ES)
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
})

it('labels a price before coupon like the Telegram caption', () => {
  const { container } = render(<TelegramPreview deal={{ ...full, previousPrice: null, coupon: 'AEES03', priceBeforeCoupon: true }} />)
  const lines = Array.from(container.querySelectorAll('[data-line]')).map((n) => n.textContent)
  expect(lines.slice(1, 3)).toEqual([`✅ Precio sin cupón: ${formatPrice(80)}`, '🎟️ Cupón: AEES03'])
})

it('shows only title, price and link for a minimal deal', () => {
  const { container } = render(
    <TelegramPreview deal={{ ...full, previousPrice: null, coupon: null, hashtags: [] }} />,
  )
  const lines = Array.from(container.querySelectorAll('[data-line]')).map((n) => n.textContent)
  expect(lines).toEqual([
    'Auriculares Sony',
    `✅ Precio: ${formatPrice(80)}`,
    `🛒 Ver en Amazon: ${URL_ES}`,
  ])
  expect(screen.queryByRole('button')).toBeNull()
})
