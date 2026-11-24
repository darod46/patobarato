import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

  it('keeps the Android intent behaviour for Amazon', async () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Linux; Android 14)', maxTouchPoints: 5 })
    const url = 'https://www.amazon.es/dp/B0ABCDEF12?tag=x-21'
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    render(<BuyButton url={url} store="amazon" />)
    const link = await screen.findByRole('link', { name: 'Ver en Amazon' })
    await waitFor(() => expect(link).not.toHaveAttribute('target'))
    expect(link).toHaveAttribute('href', url)
    expect(fireEvent.click(link)).toBe(false) // default prevented, intent opened instead
  })

  it('renders a secondary variant with a custom label and the same link behaviour', () => {
    const url = 'https://www.amazon.es/dp/B0ABCDEF12?tag=x-21'
    render(<BuyButton url={url} store="amazon" variant="secondary" label="Ver precio actual en Amazon" />)
    const link = screen.getByRole('link', { name: 'Ver precio actual en Amazon' })
    expect(link).toHaveAttribute('href', url)
    expect(link).toHaveAttribute('rel', 'sponsored noopener noreferrer')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.className).toContain('border-line')
    expect(link.className).toContain('bg-white')
    expect(link.className).not.toContain('bg-accent')
  })

  it('uses the custom label for other stores too', () => {
    render(<BuyButton url="https://www.pccomponentes.com/x" store="pccomponentes" variant="secondary" label="Ver precio actual" />)
    const link = screen.getByRole('link', { name: 'Ver precio actual' })
    expect(link.className).toContain('border-line')
  })

  it('defaults to the primary style', () => {
    render(<BuyButton url="https://www.amazon.es/dp/B0ABCDEF12" store="amazon" />)
    expect(screen.getByRole('link', { name: 'Ver en Amazon' }).className).toContain('bg-accent')
  })
})
