import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NOW, item, offer } from './fixtures'
import { QuickPicks } from './QuickPicks'

describe('QuickPicks', () => {
  it('renders the first three items with their best price', () => {
    const coupon = { code: 'X', title: 't', expiresAt: null, discountAmount: 10, discountPct: null, minPurchase: null }
    const items = [
      item(1, { award: 'Mejor en general', stores: [offer({ store: 'amazon', externalId: 'B0', coupon })] }),
      item(2, { stores: [offer({ price: null })] }),
      item(3),
      item(4, { name: 'Cuarta' }),
    ]
    render(<QuickPicks items={items} now={NOW} />)
    expect(screen.getByText('Freidora 1')).toBeInTheDocument()
    expect(screen.getByText('Freidora 2')).toBeInTheDocument()
    expect(screen.getByText('Freidora 3')).toBeInTheDocument()
    expect(screen.queryByText('Cuarta')).not.toBeInTheDocument()
    expect(screen.getByText('Mejor en general')).toBeInTheDocument()
    expect(screen.getByText('89,90 €')).toBeInTheDocument()
    expect(screen.getByText('en Amazon con cupón')).toBeInTheDocument()
    expect(screen.getByText('Sin precio ahora mismo')).toBeInTheDocument()
  })
})
