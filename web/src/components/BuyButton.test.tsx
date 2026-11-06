import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BuyButton } from './BuyButton'

afterEach(() => vi.unstubAllGlobals())

describe('BuyButton', () => {
  it('opens a non-Amazon store in a new tab with sponsored rel and its own CTA', () => {
    const url = 'https://www.aliexpress.com/item/1005006123456789.html'
    render(<BuyButton url={url} store="aliexpress" />)
    const link = screen.getByRole('link', { name: 'Ir a AliExpress' })
    expect(link).toHaveAttribute('href', url)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
  })

  it('does not apply the Android intent for non-Amazon stores', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 })
    render(<BuyButton url="https://www.pccomponentes.com/x" store="pccomponentes" />)
    const link = screen.getByRole('link', { name: 'Ir a PcComponentes' })
    expect(fireEvent.click(link)).toBe(true) // not default-prevented
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('keeps the Amazon CTA and rel', () => {
    render(<BuyButton url="https://www.amazon.es/dp/B0ABCDEF12?tag=x-21" store="amazon" />)
    const link = screen.getByRole('link', { name: 'Ver en Amazon' })
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
    expect(link).toHaveAttribute('href', 'https://www.amazon.es/dp/B0ABCDEF12?tag=x-21')
  })
})
