import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AfiliadosPage, { metadata as afiliadosMeta } from './afiliados/page'
import AvisoLegalPage, { metadata as avisoMeta } from './aviso-legal/page'
import ContactoPage, { metadata as contactoMeta } from './contacto/page'
import CookiesPage, { metadata as cookiesMeta } from './cookies/page'
import PrivacidadPage, { metadata as privacidadMeta } from './privacidad/page'

const pages = [
  { Page: AvisoLegalPage, meta: avisoMeta, h1: 'Aviso legal', path: '/aviso-legal' },
  { Page: PrivacidadPage, meta: privacidadMeta, h1: 'Política de privacidad', path: '/privacidad' },
  { Page: CookiesPage, meta: cookiesMeta, h1: 'Política de cookies', path: '/cookies' },
  { Page: AfiliadosPage, meta: afiliadosMeta, h1: 'Política de afiliación', path: '/afiliados' },
  { Page: ContactoPage, meta: contactoMeta, h1: 'Contacto', path: '/contacto' },
]

describe('legal pages', () => {
  it.each(pages)('$path renders its heading, placeholders and metadata', ({ Page, meta, h1, path }) => {
    const { container, unmount } = render(<Page />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(h1)
    expect(container.textContent).toMatch(/\[(EMAIL|TITULAR)\]/)
    expect(screen.getByText(/Última actualización/)).toBeInTheDocument()
    expect(meta.title).toBe(`${h1} · PatoBarato`)
    expect(meta.alternates?.canonical).toBe(path)
    unmount()
  })

  it('contact links to the Telegram channel', () => {
    render(<ContactoPage />)
    expect(screen.getAllByRole('link').some((l) => l.getAttribute('href') === 'https://t.me/patobarato')).toBe(true)
  })
})
