import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Coupon } from '../lib/types'
import { CouponsBlock } from './CouponsBlock'

const c = (id: number, store: string): Coupon => ({
  id, store, code: `C${id}`, title: `Cupón ${id}`, conditions: null, url: null, startsAt: '2026-11-01T00:00:00Z', expiresAt: null, discountAmount: null, discountPct: null, minPurchase: null,
})

describe('CouponsBlock', () => {
  it('renders nothing without coupons', () => {
    const { container } = render(<CouponsBlock coupons={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('names the stores present, shows at most 4 and links to the coupons page', () => {
    render(<CouponsBlock coupons={[c(1, 'aliexpress'), c(2, 'pccomponentes'), c(3, 'aliexpress'), c(4, 'aliexpress'), c(5, 'aliexpress')]} />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Cupones de AliExpress y PcComponentes')
    expect(screen.getAllByRole('button', { name: 'Copiar' })).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Todos los cupones' })).toHaveAttribute('href', '/cupones')
  })
})
