import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GuideItemCard } from './GuideItemCard'
import { NOW, item, offer } from './test-fixtures'

describe('GuideItemCard', () => {
  it('renders the section with anchor, title, best price, specs and pros/cons', () => {
    const { container } = render(
      <GuideItemCard
        item={item(2, { award: 'Más barata', pros: ['Barata'], cons: ['Ruidosa'], stores: [offer({ previousPrice: 129.9, previousMinPrice: 99.9 })] })}
        index={2}
        now={NOW}
      />,
    )
    expect(container.querySelector('section#producto-2')).not.toBeNull()
    expect(screen.getByRole('heading', { name: '2. Freidora 2' })).toBeInTheDocument()
    expect(screen.getByText('Más barata')).toBeInTheDocument()
    expect(screen.getByText('Mejor precio hoy')).toBeInTheDocument()
    expect(screen.getByText('-23 %')).toHaveAttribute('aria-label', 'Descuento del 23 %')
    expect(screen.getByText('Mínimo de los últimos 90 días')).toBeInTheDocument()
    expect(screen.getByText('Capacidad: 5 L')).toBeInTheDocument()
    expect(screen.getByText('Lo mejor')).toBeInTheDocument()
    expect(screen.getByText('Lo peor')).toBeInTheDocument()
    expect(screen.getByText('Barata')).toBeInTheDocument()
    expect(screen.getByText('claro').tagName).toBe('STRONG')
  })

  it('omits the discount badge and lowest tag without history', () => {
    render(<GuideItemCard item={item(1)} index={1} now={NOW} />)
    expect(screen.queryByText(/^-\d+ %$/)).not.toBeInTheDocument()
    expect(screen.queryByText('Mínimo de los últimos 90 días')).not.toBeInTheDocument()
  })

  it('shows no badge when the cheapest offer has no previous price, even if another store does', () => {
    const stores = [offer({ store: 'amazon', externalId: 'B0', price: 80 }), offer({ price: 90, previousPrice: 120 })]
    render(<GuideItemCard item={item(1, { stores })} index={1} now={NOW} />)
    expect(screen.queryByText(/^-\d+ %$/)).not.toBeInTheDocument()
  })

  it('uses the winner\'s own history when a store appears twice', () => {
    const stores = [
      offer({ externalId: 'a', price: 100, previousPrice: 200 }),
      offer({ externalId: 'b', price: 80, previousPrice: 100 }),
    ]
    render(<GuideItemCard item={item(1, { stores })} index={1} now={NOW} />)
    expect(screen.getByText('-20 %')).toBeInTheDocument()
  })

  it('computes the badge from the listed price, not the coupon price', () => {
    const coupon = { code: 'X', title: 't', expiresAt: null, discountAmount: 50, discountPct: null, minPurchase: null }
    render(<GuideItemCard item={item(1, { stores: [offer({ price: 100, previousPrice: 125, coupon })] })} index={1} now={NOW} />)
    expect(screen.getByText('-20 %')).toBeInTheDocument()
    expect(screen.getAllByText('50,00 €').length).toBeGreaterThan(0)
  })

  it('without a licensed photo shows the rank tile: big number and award, no image', () => {
    render(<GuideItemCard item={item(3, { award: 'Mejor en general' })} index={3} now={NOW} />)
    const tile = screen.getByTestId('rank-tile')
    expect(tile).toHaveTextContent('3')
    expect(tile).toHaveTextContent('Mejor en general')
    expect(screen.getAllByText('Mejor en general')).toHaveLength(1)
    expect(document.querySelector('img')).toBeNull()
    // The visible title drops the number the tile shows, but its accessible name keeps it.
    expect(screen.getByRole('heading', { name: '3. Freidora 3' })).toBeInTheDocument()
    expect(screen.getByText('3.')).toHaveClass('sr-only')
  })

  it('with a photo shows it and the award above the title, without the tile', () => {
    render(<GuideItemCard item={item(1, { award: 'Mejor en general', imageUrl: 'https://ae-pic-a1.aliexpress-media.com/kf/x.jpg' })} index={1} now={NOW} />)
    expect(screen.getByRole('img', { name: 'Freidora 1' })).toHaveAttribute('src', 'https://ae-pic-a1.aliexpress-media.com/kf/x.jpg')
    expect(screen.queryByTestId('rank-tile')).toBeNull()
    expect(screen.getByText('1.')).not.toHaveClass('sr-only')
  })
})
