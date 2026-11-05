import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Hero } from './Hero'

describe('Hero', () => {
  it('is frameless, mentions Amazon and has no invented figures', () => {
    const { container } = render(<Hero />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveTextContent('Amazon')
    expect(container.textContent).not.toMatch(/\d+(\.\d+)?K\b/)
    expect(container.textContent).not.toContain('AliExpress')
    expect(container.innerHTML).not.toContain('shadow-xl')
    expect(container.innerHTML).not.toContain('rounded-3xl')
    expect(container.innerHTML).not.toContain('shadow-[')
  })

  it('puts the mascot before the heading', () => {
    render(<Hero />)
    const img = screen.getByRole('img')
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(img.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('links to the deals section and Telegram', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: 'Ver chollos' })).toHaveAttribute('href', '#chollos')
    expect(screen.getByRole('link', { name: 'Unirme en Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/patobarato',
    )
  })
})
