import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GuideItemCard } from './GuideItemCard'
import { NOW, item, offer } from './fixtures'

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
    expect(screen.getByText('-23 %')).toBeInTheDocument()
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
})
