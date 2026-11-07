import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Footer } from './Footer'

describe('Footer', () => {
  it('links to the legal pages and coupons', () => {
    render(<Footer year={2026} />)
    for (const href of ['/aviso-legal', '/privacidad', '/cookies', '/afiliados', '/contacto', '/cupones', '/chollos']) {
      expect(screen.getAllByRole('link').some((l) => l.getAttribute('href') === href)).toBe(true)
    }
    expect(screen.getByText('© 2026 PatoBarato')).toBeInTheDocument()
  })

  it('links «Por categoría» to the listing page', () => {
    render(<Footer year={2026} />)
    expect(screen.getByRole('link', { name: 'Por categoría' })).toHaveAttribute('href', '/chollos')
  })

  it('names other stores in the affiliate notice only when they have data', () => {
    const { unmount } = render(<Footer year={2026} />)
    expect(screen.getByText(/Afiliado de Amazon/)).toBeInTheDocument()
    expect(screen.queryByText(/AliExpress/)).toBeNull()
    unmount()
    render(<Footer year={2026} stores={['aliexpress', 'amazon']} />)
    expect(screen.getByText(/Algunos enlaces a AliExpress pueden ser de afiliado\./)).toBeInTheDocument()
  })

  it('does not add the extra notice when the only store is Amazon', () => {
    render(<Footer year={2026} stores={['amazon']} />)
    expect(screen.queryByText(/pueden ser de afiliado/)).toBeNull()
  })
})
