import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NOW, offer } from './test-fixtures'
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
    rerender(<StoreRow offer={offer({ price: 120, coupon: { ...amountCoupon, minPurchase: 100 } })} now={NOW} />)
    expect(screen.getByText('−10 € en 100 €')).toBeInTheDocument()
  })

  it('hides the coupon chip entirely when the coupon does not apply', () => {
    render(<StoreRow offer={offer({ coupon: { ...amountCoupon, minPurchase: 500 } })} now={NOW} />)
    expect(screen.queryByText(/Te queda en/)).not.toBeInTheDocument()
    expect(screen.queryByText('PATO10')).not.toBeInTheDocument()
  })

  it('shows the code of a coupon without structured value, with no saving', () => {
    render(<StoreRow offer={offer({ coupon: { ...amountCoupon, discountAmount: null } })} now={NOW} />)
    expect(screen.getByText('PATO10')).toBeInTheDocument()
    expect(screen.queryByText(/Te queda en/)).not.toBeInTheDocument()
    expect(screen.queryByText(/−/)).not.toBeInTheDocument()
  })

  it('shows no coupon, price or saving on a stale offer', () => {
    render(<StoreRow offer={offer({ checkedAt: '2026-11-01T00:00:00Z', coupon: amountCoupon })} now={NOW} />)
    expect(screen.queryByText('PATO10')).not.toBeInTheDocument()
    expect(screen.queryByText(/Te queda en/)).not.toBeInTheDocument()
    expect(screen.queryByText(/99,90/)).not.toBeInTheDocument()
  })

  it('shows only the link when there is no price', () => {
    render(<StoreRow offer={offer({ price: null })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ver en PcComponentes' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(1)
  })

  it('renders the store CTA on a fresh row', () => {
    render(<StoreRow offer={offer()} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ir a PcComponentes' })).toBeInTheDocument()
  })

  it('renders only the store and a link when the offer is stale', () => {
    render(<StoreRow offer={offer({ checkedAt: '2026-11-01T00:00:00Z', note: 'Envío rápido' })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ver en PcComponentes' })).toHaveAttribute('href', 'https://aff.example/freidora-x')
    expect(screen.getByText('Envío rápido')).toBeInTheDocument()
    expect(screen.queryByText(/99,90/)).not.toBeInTheDocument()
  })

  it('uses the affiliate link for non-Amazon stores, falling back to the canonical url, and keeps /go/ for Amazon', () => {
    const { rerender } = render(<StoreRow offer={offer({ affiliateUrl: 'https://aff.example/pcc' })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ir a PcComponentes' })).toHaveAttribute('href', 'https://aff.example/pcc')
    rerender(<StoreRow offer={offer({ affiliateUrl: 'https://aff.example/pcc', checkedAt: '2026-11-01T00:00:00Z' })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ver en PcComponentes' })).toHaveAttribute('href', 'https://aff.example/pcc')
    rerender(<StoreRow offer={offer({ store: 'amazon', externalId: 'B0X', affiliateUrl: 'https://amazon.es/dp/B0X?tag=t' })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ver en Amazon' })).toHaveAttribute('href', '/go/B0X')
  })

  it('shows previous price struck through only when there is one, and Amazon goes through /go/', () => {
    const { rerender } = render(<StoreRow offer={offer({ store: 'amazon', externalId: 'B0ABCDEF12' })} now={NOW} />)
    expect(document.querySelector('s')).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver en Amazon' })).toHaveAttribute('href', '/go/B0ABCDEF12')
    rerender(<StoreRow offer={offer({ previousPrice: 129.9 })} now={NOW} />)
    expect(document.querySelector('s')).toHaveTextContent('129,90 €')
  })

  it('renders nothing for a non-Amazon store without an affiliate link (fresh, stale or priceless)', () => {
    const none = { affiliateUrl: null }
    const fresh = render(<StoreRow offer={offer(none)} now={NOW} />)
    expect(fresh.container).toBeEmptyDOMElement()
    const stale = render(<StoreRow offer={offer({ ...none, checkedAt: '2026-11-01T00:00:00Z' })} now={NOW} />)
    expect(stale.container).toBeEmptyDOMElement()
    const priceless = render(<StoreRow offer={offer({ ...none, price: null })} now={NOW} />)
    expect(priceless.container).toBeEmptyDOMElement()
  })

  it('keeps an Amazon row without affiliateUrl, since /go/ always adds the tag', () => {
    render(<StoreRow offer={offer({ store: 'amazon', externalId: 'B0X', affiliateUrl: null })} now={NOW} />)
    expect(screen.getByRole('link', { name: 'Ver en Amazon' })).toHaveAttribute('href', '/go/B0X')
  })
})
