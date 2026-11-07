import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { siteEvent } from '../test-utils/siteEvent'
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
    const { container } = render(<Hero highlights={none} storeNames={['Amazon']} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'El pato que caza los chollos antes de que vuelen',
    )
    expect(
      screen.getByText(
        'Amazon. Cada oferta con su precio, el precio anterior y el cupón si lo hay. Sin registros ni spam.',
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?K\b/)
    expect(screen.queryAllByTestId('hero-badge')).toHaveLength(0)
  })

  it('shows one floating badge per real highlight', () => {
    render(<Hero highlights={full} storeNames={['Amazon']} />)
    const badges = screen.getAllByTestId('hero-badge')
    expect(badges.map((b) => b.textContent)).toEqual([
      '-42%Smart TV Xiaomi 55"',
      'Cupón−6 € en 40 €',
      'Mínimo histórico',
    ])
  })

  it('shows the mascot and the guarantees', () => {
    render(<Hero highlights={none} storeNames={['Amazon']} />)
    expect(screen.getByRole('img', { name: 'Mascota de PatoBarato, un pato superhéroe' })).toHaveAttribute(
      'src',
      '/pato-heroe.svg',
    )
    for (const text of ['Precio comprobado', 'Cupón incluido cuando existe', 'Gratis, sin cuenta']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })

  it('links to the deals section and Telegram', () => {
    render(<Hero highlights={none} storeNames={['Amazon']} />)
    expect(screen.getByRole('link', { name: 'Ver chollos de hoy' })).toHaveAttribute('href', '/#chollos')
    expect(screen.getByRole('link', { name: 'Recibirlos en Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/patobarato',
    )
  })

  it('names the stores from data, joined in Spanish, with an Amazon fallback', () => {
    const { unmount } = render(<Hero highlights={none} storeNames={['Amazon']} />)
    expect(screen.getByText(/^Amazon\. Cada oferta con su precio/)).toBeInTheDocument()
    unmount()
    const two = render(<Hero highlights={none} storeNames={['Amazon', 'AliExpress', 'PcComponentes']} />)
    expect(screen.getByText(/^Amazon, AliExpress y PcComponentes\. Cada oferta con su precio/)).toBeInTheDocument()
    two.unmount()
    render(<Hero highlights={none} storeNames={[]} />)
    expect(screen.getByText(/^Amazon\. Cada oferta/)).toBeInTheDocument()
  })

  it('points the primary button at the event in progress', () => {
    const bf = siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' })
    render(<Hero highlights={none} storeNames={['Amazon']} activeEvent={bf} />)
    expect(screen.getByRole('link', { name: 'Chollos del Black Friday' })).toHaveAttribute('href', '/eventos/black-friday')
    expect(screen.queryByRole('link', { name: 'Ver chollos de hoy' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Recibirlos en Telegram' })).toHaveAttribute('href', 'https://t.me/patobarato')
  })

  it('keeps the deals button without an event in progress', () => {
    render(<Hero highlights={none} storeNames={['Amazon']} activeEvent={null} />)
    expect(screen.getByRole('link', { name: 'Ver chollos de hoy' })).toHaveAttribute('href', '/#chollos')
  })
})
