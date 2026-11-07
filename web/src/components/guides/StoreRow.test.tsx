import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NOW, offer } from './fixtures'
import { StoreRow } from './StoreRow'

const amountCoupon = { code: 'PATO10', title: 't', expiresAt: null, discountAmount: 10, discountPct: null, minPurchase: null }

describe('StoreRow', () => {
  it('shows the final price with an amount coupon', () => {
    render(<StoreRow offer={offer({ coupon: amountCoupon })} now={NOW} />)
    expect(screen.getByText('Te queda en 89,90 €')).toBeInTheDocument()
    expect(screen.getByText('PATO10')).toBeInTheDocument()
    expect(screen.getByText('−10 €')).toBeInTheDocument()
  })

  it('formats percentage and minimum-purchase coupon values', () => {
    const { rerender } = render(
      <StoreRow offer={offer({ coupon: { ...amountCoupon, discountAmount: null, discountPct: 5 } })} now={NOW} />,
    )
    expect(screen.getByText('−5 %')).toBeInTheDocument()
    rerender(<StoreRow offer={offer({ coupon: { ...amountCoupon, minPurchase: 100 } })} now={NOW} />)
    expect(screen.getByText('−10 € en 100 €')).toBeInTheDocument()
  })

  it('omits "Te queda en" when the coupon does not apply', () => {
    render(<StoreRow offer={offer({ coupon: { ...amountCoupon, minPurchase: 500 } })} now={NOW} />)
    expect(screen.queryByText(/Te queda en/)).not.toBeInTheDocument()
  })

  it('renders only the store and a link when the offer is stale', () => {
    render(<StoreRow offer={offer({ checkedAt: '2026-11-01T00:00:00Z', note: 'Envío rápido' })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ver en PcComponentes' })).toHaveAttribute('href', 'https://www.pccomponentes.com/freidora-x')
    expect(screen.getByText('Envío rápido')).toBeInTheDocument()
    expect(screen.queryByText(/99,90/)).not.toBeInTheDocument()
  })

  it('shows previous price struck through only when there is one, and Amazon goes through /go/', () => {
    const { rerender } = render(<StoreRow offer={offer({ store: 'amazon', externalId: 'B0ABCDEF12' })} now={NOW} />)
    expect(document.querySelector('s')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver en Amazon' })).toHaveAttribute('href', '/go/B0ABCDEF12')
    rerender(<StoreRow offer={offer({ previousPrice: 129.9 })} now={NOW} />)
    expect(document.querySelector('s')).toHaveTextContent('129,90 €')
  })
})
