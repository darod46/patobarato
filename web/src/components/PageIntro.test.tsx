import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PageCopy } from '../lib/types'
import { siteEvent } from '../test-utils/siteEvent'
import { PageFaq, PageIntro } from './PageIntro'

const copy = (over: Partial<PageCopy> = {}): PageCopy => ({
  kind: 'static',
  slug: 'chollos',
  title: 'Chollos',
  h1: 'Chollos de hoy',
  introMd: 'Hay **{deals}** chollos activos.\n\nTexto fijo.',
  faq: [{ q: '¿Cada cuánto se actualiza?', aMd: 'Cada hora.' }],
  updatedAt: '2026-11-01T00:00:00Z',
  ...over,
})

const bf = siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29' })

function jsonLd(container: HTMLElement) {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map((s) => JSON.parse(s.textContent ?? ''))
}

describe('PageIntro', () => {
  it('renders the h1', () => {
    render(<PageIntro h1="Chollos de hoy" copy={null} values={{}} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
  })

  it('links the next event', () => {
    render(<PageIntro h1="X" copy={null} values={{}} nextEvent={bf} />)
    const link = screen.getByRole('link', { name: 'Black Friday 2026' })
    expect(link).toHaveAttribute('href', '/eventos/black-friday')
    expect(link.parentElement).toHaveTextContent('Próximo evento: Black Friday 2026 (27 – 29 de noviembre)')
  })

  it('keeps the event icon beside the text in one flex row, with a padded link as tap target', () => {
    render(<PageIntro h1="X" copy={null} values={{}} nextEvent={bf} />)
    const row = screen.getByTestId('next-event')
    expect(row).toHaveClass('flex', 'items-start', 'gap-2')
    expect(row.children).toHaveLength(2)
    expect(row.children[0].tagName.toLowerCase()).toBe('svg')
    expect(row.children[1]).toHaveTextContent('Próximo evento: Black Friday 2026')
    expect(screen.getByRole('link', { name: 'Black Friday 2026' })).toHaveClass('inline-block', 'py-3', '-my-3')
  })

  it('renders the intro markers but leaves the FAQ to PageFaq', () => {
    const { container } = render(<PageIntro h1="X" copy={copy()} values={{ deals: 42 }} />)
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Texto fijo.')).toBeInTheDocument()
    expect(screen.queryByText('¿Cada cuánto se actualiza?')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
  })

  it('PageFaq renders the FAQ and its FAQPage JSON-LD', () => {
    const { container } = render(<PageFaq faq={copy().faq} />)
    expect(screen.getByText('¿Cada cuánto se actualiza?')).toBeInTheDocument()
    expect(jsonLd(container).some((d) => d['@type'] === 'FAQPage')).toBe(true)
  })

  it('PageFaq renders nothing without questions', () => {
    for (const faq of [[], null, undefined]) {
      const { container, unmount } = render(<PageFaq faq={faq} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('renders only the h1 without copy and emits no JSON-LD', () => {
    const { container } = render(<PageIntro h1="Solo título" copy={null} values={{ deals: 5 }} />)
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('details')).toBeNull()
    expect(container.querySelectorAll('p')).toHaveLength(0)
  })


  it('never shows a literal marker', () => {
    const { container } = render(<PageIntro h1="X" copy={copy({ introMd: 'Hay {deals} chollos. En {stores} también.\n\nFin.' })} values={{}} />)
    expect(container.textContent).not.toMatch(/\{(deals|stores)\}/)
    expect(screen.getByText('Fin.')).toBeInTheDocument()
  })
})
