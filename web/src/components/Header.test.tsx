import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NAV_LINKS } from '../lib/nav'
import { Header } from './Header'

describe('Header', () => {
  it('shows the logo, the main navigation and the channel button', () => {
    render(<Header />)
    expect(screen.getByAltText('PatoBarato')).toHaveAttribute('src', '/logo.svg')
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Chollos', 'Cupones', 'Tiendas', 'Guías'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(NAV_LINKS.map((l) => l.href))
    expect(links[0]).toHaveAttribute('href', '/chollos')
    expect(screen.getByRole('link', { name: 'Unirme al canal' })).toHaveAttribute('href', 'https://t.me/patobarato')
    expect(screen.getByRole('link', { name: /Buscar chollos/ })).toHaveAttribute('href', '/buscar')
  })

  it('is translucent with a backdrop blur so the page shows through', () => {
    render(<Header />)
    expect(screen.getByRole('banner')).toHaveClass('bg-white/80', 'backdrop-blur')
  })

  it('shows the search trigger by default and hides it with searchTrigger={false}', () => {
    const { rerender } = render(<Header />)
    expect(screen.getByRole('link', { name: /Buscar chollos/ })).toHaveAttribute('href', '/buscar')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    rerender(<Header searchTrigger={false} />)
    expect(screen.queryByRole('link', { name: /Buscar chollos/ })).not.toBeInTheDocument()
  })
})
