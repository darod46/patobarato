import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackCtaClick = vi.fn()
vi.mock('../lib/cta', () => ({ trackCtaClick: (p: string) => trackCtaClick(p) }))

import { TelegramCta } from './TelegramCta'

describe('TelegramCta', () => {
  beforeEach(() => trackCtaClick.mockClear())

  it('renders a safe new-tab link to the channel', () => {
    render(<TelegramCta placement="hero" className="x">Unirme</TelegramCta>)
    const a = screen.getByRole('link', { name: 'Unirme' })
    expect(a).toHaveAttribute('href', 'https://t.me/patobarato')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
    expect(a).toHaveClass('x')
  })

  it('counts a click without preventing default', () => {
    render(<TelegramCta placement="hero">Unirme</TelegramCta>)
    const notPrevented = fireEvent.click(screen.getByRole('link'))
    expect(trackCtaClick).toHaveBeenCalledWith('hero')
    expect(notPrevented).toBe(true)
  })

  it('counts a middle click', () => {
    render(<TelegramCta placement="footer">Unirme</TelegramCta>)
    const notPrevented = fireEvent(screen.getByRole('link'), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
    expect(trackCtaClick).toHaveBeenCalledWith('footer')
    expect(notPrevented).toBe(true)
  })

  it('respects a custom href and extra attributes', () => {
    render(
      <TelegramCta placement="recent" href="https://t.me/patobarato/42" aria-label="Ver">
        Ver
      </TelegramCta>,
    )
    const a = screen.getByRole('link', { name: 'Ver' })
    expect(a).toHaveAttribute('href', 'https://t.me/patobarato/42')
  })
})
