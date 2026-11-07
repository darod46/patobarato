import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Coupon } from '../lib/types'
import { CouponCard } from './CouponCard'

const coupon: Coupon = {
  id: 1,
  store: 'aliexpress',
  code: 'PATO6',
  title: '−6 € en 40 €',
  conditions: 'Todos los productos. Un uso por cuenta.',
  url: 'https://s.click.aliexpress.com/x',
  startsAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-11-11T22:59:00Z',
  discountAmount: null, discountPct: null, minPurchase: null,
}

afterEach(() => vi.unstubAllGlobals())

describe('CouponCard', () => {
  it('shows store, expiry, title, conditions, code and the store link', () => {
    render(<CouponCard coupon={coupon} />)
    expect(screen.getByText('AliExpress')).toBeInTheDocument()
    expect(screen.getByText('Caduca 11 nov')).toBeInTheDocument()
    expect(screen.getByText('−6 € en 40 €')).toBeInTheDocument()
    expect(screen.getByText('Todos los productos. Un uso por cuenta.')).toBeInTheDocument()
    expect(screen.getByText('PATO6')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a AliExpress' })).toHaveAttribute('href', coupon.url)
  })

  it('copies the code and confirms', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<CouponCard coupon={coupon} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(writeText).toHaveBeenCalledWith('PATO6')
    expect(screen.getByRole('button', { name: 'Copiado' })).toBeInTheDocument()
  })

  it('does not fail without a clipboard and omits the link and expiry when absent', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    render(<CouponCard coupon={{ ...coupon, url: null, expiresAt: null }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }))
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(/Caduca/)).toBeNull()
  })
})
