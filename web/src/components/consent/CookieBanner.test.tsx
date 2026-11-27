import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_KEY } from '../../lib/consent'
import { TyreFinder } from '../guides/TyreFinder'
import { CookieBanner } from './CookieBanner'
import { CookiePreferences } from './CookiePreferences'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

beforeEach(() => {
  window.localStorage.clear()
  nav.pathname = '/'
})

const banner = () => screen.queryByRole('region', { name: 'Aviso de cookies' })

describe('CookieBanner', () => {
  it('asks until the reader decides, with reject and accept side by side and a link to the policy', () => {
    render(<CookieBanner />)
    expect(banner()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Más información' })).toHaveAttribute('href', '/cookies')
  })

  it('is not part of the server render', () => {
    expect(renderToStaticMarkup(<CookieBanner />)).toBe('')
  })

  it.each([
    ['Aceptar', 'yes'],
    ['Rechazar', 'no'],
  ])('«%s» stores the choice and closes the banner', (label, stored) => {
    render(<CookieBanner />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe(stored)
    expect(banner()).toBeNull()
  })

  it('never shows on deal pages', () => {
    nav.pathname = '/oferta/amazon/freidora-b0abcdef12'
    render(<CookieBanner />)
    expect(banner()).toBeNull()
  })

  it('stays closed once decided', () => {
    window.localStorage.setItem(CONSENT_KEY, 'no')
    render(<CookieBanner />)
    expect(banner()).toBeNull()
  })

  it('accepting in the banner loads a tyre finder already on the page', () => {
    const { container } = render(
      <>
        <TyreFinder />
        <CookieBanner />
      </>,
    )
    expect(container.querySelector('iframe')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    expect(container.querySelector('iframe')).not.toBeNull()
  })

  it('the cookie policy shows the choice and can forget it, which brings the banner back', async () => {
    window.localStorage.setItem(CONSENT_KEY, 'yes')
    render(
      <>
        <CookiePreferences />
        <CookieBanner />
      </>,
    )
    await act(async () => {})
    expect(screen.getByText(/Has aceptado las cookies de Awin/)).toBeInTheDocument()
    expect(banner()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar mi elección' }))
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull()
    expect(banner()).toBeInTheDocument()
  })
})
