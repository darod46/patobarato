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

  it('falls back to the placeholder image', () => {
    render(<GuideItemCard item={item(1)} index={1} now={NOW} />)
    expect(screen.getByRole('img', { name: 'Freidora 1' })).toHaveAttribute('src', '/pato-placeholder.svg')
  })
})
