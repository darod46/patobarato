import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatPrice } from '../../lib/format'
import { storeInfo } from '../../lib/stores'
import { CatalogCard } from './CatalogCard'
import { product } from './fixtures'

describe('CatalogCard', () => {
  it('shows no badge nor struck price without originalPrice', () => {
    const { container } = render(<CatalogCard product={product()} />)
    expect(container.textContent).toContain(formatPrice(19.99))
    expect(container.querySelector('s')).toBeNull()
    expect(screen.queryByText(/^-\d+ ?%/)).toBeNull()
  })

  it('shows badge and struck original price when discounted', () => {
    const { container } = render(
      <CatalogCard product={product({ originalPrice: 39.99, discountPct: 50 })} />,
    )
    expect(container.querySelector('s')?.textContent).toBe(formatPrice(39.99))
    expect(screen.getByText('-50 %')).toBeInTheDocument()
  })

  it('uses the store short name for Awin and AliExpress for aliexpress', () => {
    const { unmount } = render(<CatalogCard product={product()} />)
    expect(screen.getByText(storeInfo('pccomponentes').short)).toBeInTheDocument()
    unmount()
    render(<CatalogCard product={product({ origin: 'aliexpress', store: 'aliexpress' })} />)
    expect(screen.getByText('AliExpress')).toBeInTheDocument()
  })

  it('links to the affiliate url in a new tab with sponsored rel, never /go/', () => {
    render(<CatalogCard product={product()} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', 'https://track.example/go?x=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
    expect(link).toHaveClass('min-h-11')
  })

  it('falls back to the placeholder without image', () => {
    render(<CatalogCard product={product({ imageUrl: null })} />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/pato-placeholder.svg')
  })
})
