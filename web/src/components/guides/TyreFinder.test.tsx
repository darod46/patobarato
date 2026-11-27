import { act, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it } from 'vitest'
import { AWIN_FINDER, CONSENT_KEY, TyreFinder } from './TyreFinder'

const SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-top-navigation-by-user-activation'
const HEADING = 'Calcula el precio en tu medida'
const ACCEPT = 'Aceptar y mostrar el buscador'
const WITHDRAW = 'Retirar consentimiento'

beforeEach(() => window.localStorage.clear())

describe('TyreFinder', () => {
  it('embeds the Neumaticos.es configurator through Awin’s click URL (not the wrapper frame)', () => {
    expect(AWIN_FINDER).toBe(
      'https://www.awin1.com/awclick.php?mid=11552&id=3145511&gid=397643&linkid=2718820&p=https://www.neumaticos.es/affiliates/configurator?ID=aff_tn_es_awin',
    )
  })

  it('the server render never contains the finder', () => {
    window.localStorage.setItem(CONSENT_KEY, 'yes')
    const html = renderToStaticMarkup(<TyreFinder />)
    expect(html).not.toContain('<iframe')
    expect(html).toContain(ACCEPT)
  })

  it('without consent it asks inline, with a link to the cookie policy, and loads nothing', () => {
    const { container } = render(<TyreFinder />)
    expect(screen.getByRole('region', { name: HEADING })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: ACCEPT })).toBeEnabled()
    expect(screen.getByRole('link', { name: 'política de cookies' })).toHaveAttribute('href', '/cookies')
    expect(screen.getByText(/El buscador lo sirve Awin, que usa cookies de afiliado/)).toBeInTheDocument()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('accepting loads the finder, remembers the choice and shows the affiliate note below it', () => {
    const { container } = render(<TyreFinder />)
    fireEvent.click(screen.getByRole('button', { name: ACCEPT }))
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('yes')
    const f = container.querySelector('iframe')!
    expect(f).toHaveAttribute('src', AWIN_FINDER)
    expect(f).toHaveAttribute('height', '580')
    expect(f).toHaveAttribute('title', 'Buscador de neumáticos de Neumaticos.es')
    expect(f).toHaveAttribute('loading', 'lazy')
    expect(f).toHaveAttribute('sandbox', SANDBOX)
    expect(f).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
    const note = screen.getByText(/Buscador de Neumaticos.es con enlace de afiliado/)
    expect(f.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a stored choice loads the finder straight away; withdrawing removes it and the choice', async () => {
    window.localStorage.setItem(CONSENT_KEY, 'yes')
    const { container } = render(<TyreFinder />)
    await act(async () => {})
    expect(container.querySelector('iframe')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: WITHDRAW }))
    expect(container.querySelector('iframe')).toBeNull()
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull()
    expect(screen.getByRole('button', { name: ACCEPT })).toBeInTheDocument()
  })

  it('gives each instance its own heading id', () => {
    const { container } = render(
      <>
        <TyreFinder />
        <TyreFinder />
      </>,
    )
    const ids = [...container.querySelectorAll('h2')].map((h) => h.id)
    expect(new Set(ids).size).toBe(2)
  })
})
