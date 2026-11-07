import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Deal } from '../lib/types'
import { DealCarousel } from './DealCarousel'

const now = new Date('2026-11-04T12:00:00Z')
const deal = (id: number): Deal => ({
  publicationId: id,
  publishedAt: '2026-11-04T11:55:00Z',
  price: 10,
  previousPrice: null,
  coupon: null,
  hashtags: [],
  affiliateUrl: 'https://amzn.to/x',
  title: `Chollo ${id}`,
  imageUrl: null,
  asin: `A${id}`,
  country: 'es',
  store: 'amazon',
  productId: id,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
})
const list = (n: number) => Array.from({ length: n }, (_, i) => deal(i + 1))

describe('DealCarousel', () => {
  it('shows at most the first 5 deals in a snap-scrolling region', () => {
    render(<DealCarousel deals={list(8)} now={now} />)
    const region = screen.getByRole('region', { name: 'Últimos chollos' })
    expect(region).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory')
    expect(within(region).getAllByRole('link')).toHaveLength(5)
    expect(within(region).queryByText('Chollo 6')).toBeNull()
    expect(within(region).getByText('Chollo 5')).toBeInTheDocument()
  })

  it('links to the full listing with a primary button', () => {
    render(<DealCarousel deals={list(2)} now={now} />)
    const link = screen.getByRole('link', { name: 'Ver todos los chollos' })
    expect(link).toHaveAttribute('href', '/chollos')
    expect(link).toHaveClass('min-h-12')
  })

  it('shows an honest message, no row and the button when there are no deals', () => {
    render(<DealCarousel deals={[]} now={now} />)
    expect(screen.getByText('Ahora mismo no podemos cargar los chollos')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Últimos chollos' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Ver todos los chollos' })).toHaveAttribute('href', '/chollos')
  })

  it('scrolls by one measured card, honours reduced motion and disables the buttons at the ends', async () => {
    const user = userEvent.setup()
    render(<DealCarousel deals={list(5)} now={now} />)
    const region = screen.getByRole('region', { name: 'Últimos chollos' })
    expect(region).toHaveAttribute('tabindex', '0')
    const scrollBy = vi.fn()
    region.scrollBy = scrollBy as unknown as typeof region.scrollBy
    region.style.columnGap = '12px' // Tailwind CSS is not loaded in jsdom
    Object.defineProperty(region.firstElementChild!, 'offsetWidth', { value: 300 })
    Object.defineProperty(region, 'clientWidth', { value: 600, configurable: true })
    Object.defineProperty(region, 'scrollWidth', { value: 1500, configurable: true })
    const next = screen.getByRole('button', { name: 'Siguiente' })
    const prev = screen.getByRole('button', { name: 'Anterior' })
    expect(next).toHaveClass('size-11')
    expect(prev).toBeDisabled()
    expect(next).toBeEnabled()
    await user.click(next)
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 312, behavior: 'smooth' })
    region.scrollLeft = 300
    fireEvent.scroll(region)
    expect(prev).toBeEnabled()
    region.scrollLeft = 900
    fireEvent.scroll(region)
    expect(next).toBeDisabled()
    await user.click(prev)
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -312, behavior: 'smooth' })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    try {
      await user.click(prev)
      expect(scrollBy).toHaveBeenLastCalledWith({ left: -312, behavior: 'auto' })
    } finally {
      // @ts-expect-error restoring the jsdom default (no matchMedia)
      delete window.matchMedia
    }
  })

  it('hydrates server HTML without mismatches', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<DealCarousel deals={list(3)} now={now} />)
    document.body.appendChild(container)
    const onRecoverableError = vi.fn()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let root: Root | undefined
    try {
      await act(async () => {
        root = hydrateRoot(container, <DealCarousel deals={list(3)} now={now} />, { onRecoverableError })
      })
      expect(onRecoverableError).not.toHaveBeenCalled()
      expect(errors).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    } finally {
      act(() => root?.unmount())
      container.remove()
      errors.mockRestore()
    }
  })
})
