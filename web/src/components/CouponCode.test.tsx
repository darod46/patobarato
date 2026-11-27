import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CouponCode, couponCode } from './CouponCode'

afterEach(() => vi.unstubAllGlobals())

describe('couponCode', () => {
  it.each([
    ['ESBF02', 'ESBF02'],
    ['IFPGXPMU', 'IFPGXPMU'],
    ['Código PATO5', 'PATO5'],
    ['Cupón: AEES20 (pedido mínimo)', 'AEES20'],
    ['y pagando con PayPal', null],
    ['39 €', null],
    ['activo, aprovecha', null],
    ['Cupón 5 %', null],
  ])('%s → %s', (text, code) => {
    expect(couponCode(text)).toBe(code)
  })
})

describe('CouponCode', () => {
  it('copies the code when tapped and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CouponCode coupon="Código PATO5" />)
    const button = screen.getByRole('button', { name: 'Copiar el cupón PATO5' })
    expect(button).toHaveTextContent('PATO5')
    await act(async () => fireEvent.click(button))
    expect(writeText).toHaveBeenCalledWith('PATO5')
    expect(screen.getByRole('button', { name: 'Cupón PATO5 copiado' })).toHaveTextContent('Copiado')
  })

  it('shows free text as a visible note, not a button', () => {
    render(<CouponCode coupon="y pagando con PayPal" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByTestId('coupon')).toHaveTextContent('Cupón: y pagando con PayPal')
  })
})
