import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Guide } from '../lib/types'
import { GuideView } from './GuideView'
import { NOW, item, offer } from './guides/test-fixtures'

const guide = (over: Partial<Guide> = {}): Guide => ({
  slug: 'mejores-freidoras',
  title: 'Mejores freidoras de aire',
  subtitle: 'Las que merecen la pena',
  category: 'Cocina',
  author: 'Ana',
  readingMinutes: 6,
  publishedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-07T12:00:00Z',
  pricesCheckedAt: '2026-11-07T06:00:00Z',
  introMd: 'Introducción de la guía.',
  howToChooseMd: 'Elige según la capacidad.',
  faq: [{ q: '¿Cuánto gastan?', aMd: 'Poco.' }],
  items: [item(1), item(2), item(3)],
  widget: null,
  ...over,
})

describe('GuideView', () => {
  it('assembles header, byline, sections and heading hierarchy', () => {
    render(<GuideView guide={guide()} now={NOW} stores={['amazon']} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Mejores freidoras de aire' })).toBeInTheDocument()
    expect(screen.getByText('Guía de compra · Cocina')).toBeInTheDocument()
    expect(screen.getByText('Las que merecen la pena')).toBeInTheDocument()
    expect(screen.getByText(/Por Ana · equipo PatoBarato/)).toBeInTheDocument()
    expect(screen.getByText('Actualizado el 7 de noviembre de 2026')).toBeInTheDocument()
    expect(screen.getByText('6 min de lectura')).toBeInTheDocument()
    expect(screen.getByText(/Precios revisados/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Nuestras recomendaciones' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 3 }).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByText('Introducción de la guía.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Comparativa' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Preguntas frecuentes' })).toBeInTheDocument()
    expect(document.getElementById('como-elegir')).not.toBeNull()
    const crumbs = within(screen.getByRole('navigation', { name: 'Ruta de navegación' }))
    expect(crumbs.getByRole('link', { name: 'Guías' })).toHaveAttribute('href', '/guias')
    expect(crumbs.queryByRole('link', { name: 'Mejores freidoras de aire' })).toBeNull()
    expect(crumbs.getByText('Mejores freidoras de aire')).toHaveAttribute('aria-current', 'page')
    for (const id of ['eleccion-rapida', 'comparativa', 'faq']) expect(document.getElementById(id)).not.toBeNull()
  })

  it('shows the cover under the header when the guide has one, and nothing otherwise', () => {
    const { unmount } = render(<GuideView guide={{ ...guide(), slug: 'freidoras-de-aire-menos-100' }} now={NOW} stores={['amazon']} />)
    const cover = screen.getByRole('img', { name: /El pato de PatoBarato con el producto/ })
    expect(cover).toHaveAttribute('src', '/guias/freidoras-de-aire-menos-100.jpeg')
    unmount()
    render(<GuideView guide={guide()} now={NOW} stores={['amazon']} />)
    expect(screen.queryByRole('img', { name: /El pato de PatoBarato/ })).toBeNull()
  })
  it('shows the stale-price label and still renders the guide', () => {
    const stale = guide({ pricesCheckedAt: null, items: [item(1, { stores: [offer({ checkedAt: null })] })] })
    render(<GuideView guide={stale} now={NOW} stores={[]} />)
    expect(screen.getByText('Precios no disponibles')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('omits empty sections and their TOC entries', () => {
    const bare = guide({ howToChooseMd: '  ', faq: [], items: [item(1, { specs: [] })] })
    render(<GuideView guide={bare} now={NOW} stores={[]} />)
    expect(screen.queryByRole('heading', { name: 'Comparativa' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Preguntas frecuentes' })).toBeNull()
    expect(document.getElementById('como-elegir')).toBeNull()
    expect(document.getElementById('comparativa')).toBeNull()
    expect(document.getElementById('faq')).toBeNull()
    const toc = within(screen.getAllByRole('navigation', { name: 'En esta guía' })[0]!)
    expect(toc.queryByRole('link', { name: 'Comparativa' })).toBeNull()
    expect(toc.queryByRole('link', { name: 'Cómo elegir' })).toBeNull()
    expect(toc.queryByRole('link', { name: 'Preguntas frecuentes' })).toBeNull()
  })

  it('shows no price-freshness label in a guide without items', () => {
    render(<GuideView guide={guide({ items: [], pricesCheckedAt: null })} now={NOW} stores={[]} />)
    expect(screen.queryByText('Precios no disponibles')).toBeNull()
    expect(screen.getByText(/min de lectura/)).toBeInTheDocument()
  })

  it('omits quick picks and recommendations when there are no items', () => {
    render(<GuideView guide={guide({ items: [] })} now={NOW} stores={[]} />)
    expect(document.getElementById('eleccion-rapida')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Nuestras recomendaciones' })).toBeNull()
  })

  const FINDER = 'Calcula el precio en tu medida'
  const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  it('shows the tyre finder twice in a guide without items: after the intro and before the FAQ', () => {
    render(<GuideView guide={guide({ items: [], widget: 'neumaticos' })} now={NOW} stores={[]} />)
    expect(screen.getAllByRole('heading', { level: 2, name: FINDER })).toHaveLength(2)
    expect(screen.queryByRole('heading', { name: 'Nuestras recomendaciones' })).toBeNull()
    const [first, second] = screen.getAllByRole('region', { name: FINDER })
    expect(follows(screen.getByText('Introducción de la guía.'), first!)).toBe(true)
    expect(follows(first!, document.getElementById('como-elegir')!)).toBe(true)
    expect(follows(document.getElementById('como-elegir')!, second!)).toBe(true)
    expect(follows(second!, document.getElementById('faq')!)).toBe(true)
  })

  it('places the first finder right after the quick picks when there are items', () => {
    render(<GuideView guide={guide({ widget: 'neumaticos' })} now={NOW} stores={[]} />)
    const finders = screen.getAllByRole('region', { name: FINDER })
    expect(finders).toHaveLength(2)
    expect(follows(document.getElementById('eleccion-rapida')!, finders[0]!)).toBe(true)
    expect(follows(finders[0]!, screen.getByText('Introducción de la guía.'))).toBe(true)
    expect(follows(finders[1]!, document.getElementById('faq')!)).toBe(true)
  })

  it('puts the second finder at the end when there is no FAQ', () => {
    render(<GuideView guide={guide({ items: [], faq: [], widget: 'neumaticos' })} now={NOW} stores={[]} />)
    const finders = screen.getAllByRole('region', { name: FINDER })
    expect(finders).toHaveLength(2)
    expect(follows(document.getElementById('como-elegir')!, finders[1]!)).toBe(true)
  })

  it('shows no finder without widget', () => {
    render(<GuideView guide={guide()} now={NOW} stores={[]} />)
    expect(screen.queryByRole('heading', { name: FINDER })).toBeNull()
    expect(document.querySelector('iframe')).toBeNull()
  })
})
