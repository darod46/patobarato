import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero, type HeroHighlights } from './Hero'

const none: HeroHighlights = {
  topDiscountPct: null,
  topDiscountTitle: null,
  latestCouponTitle: null,
  hasLowest: false,
}

const full: HeroHighlights = {
  topDiscountPct: 42,
  topDiscountTitle: 'Smart TV Xiaomi 55"',
  latestCouponTitle: '−6 € en 40 €',
  hasLowest: true,
}

describe('Hero', () => {
  it('uses the redesign copy and has no invented figures', () => {
    const { container } = render(<Hero highlights={none} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'El pato que caza los chollos antes de que vuelen',
    )
    expect(
      screen.getByText(
        'Amazon, AliExpress, PcComponentes y más. Cada oferta con su precio, el precio anterior y el cupón si lo hay. Sin registros ni spam.',
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?K\b/)
    expect(screen.queryAllByTestId('hero-badge')).toHaveLength(0)
  })

  it('shows one floating badge per real highlight', () => {
    render(<Hero highlights={full} />)
    const badges = screen.getAllByTestId('hero-badge')
    expect(badges.map((b) => b.textContent)).toEqual([
      '-42%Smart TV Xiaomi 55"',
      'Cupón−6 € en 40 €',
      'Mínimo histórico',
    ])
  })

  it('shows the mascot and the guarantees', () => {
    render(<Hero highlights={none} />)
    expect(screen.getByRole('img', { name: 'Mascota de PatoBarato, un pato superhéroe' })).toHaveAttribute(
      'src',
      '/pato-heroe.svg',
    )
    for (const text of ['Precio comprobado', 'Cupón incluido cuando existe', 'Gratis, sin cuenta']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('links to the deals section and Telegram', () => {
    render(<Hero highlights={none} />)
    expect(screen.getByRole('link', { name: 'Ver chollos de hoy' })).toHaveAttribute('href', '/#chollos')
    expect(screen.getByRole('link', { name: 'Recibirlos en Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/patobarato',
    )
  })
})
