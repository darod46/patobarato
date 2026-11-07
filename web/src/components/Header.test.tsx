import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NAV_LINKS } from '../lib/nav'
import { Header } from './Header'

describe('Header', () => {
  it('shows the logo, the main navigation and the channel button', () => {
    render(<Header search={<input aria-label="Buscar chollos" />} />)
    expect(screen.getByAltText('PatoBarato')).toHaveAttribute('src', '/logo.svg')
    const nav = screen.getByRole('navigation', { name: 'Principal' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Chollos', 'Cupones', 'Tiendas', 'Guías', 'Cómo funciona', 'Telegram'])
    expect(links.map((l) => l.getAttribute('href'))).toEqual(NAV_LINKS.map((l) => l.href))
    expect(screen.getByRole('link', { name: 'Unirme al canal' })).toHaveAttribute('href', 'https://t.me/patobarato')
    expect(screen.getByLabelText('Buscar chollos')).toBeInTheDocument()
  })

  it('is translucent with a backdrop blur so the page shows through', () => {
    render(<Header search={null} />)
    expect(screen.getByRole('banner')).toHaveClass('bg-white/80', 'backdrop-blur')
  })

  it('renders without a search box', () => {
    render(<Header search={null} />)
    expect(screen.queryByLabelText('Buscar chollos')).toBeNull()
  })
})
