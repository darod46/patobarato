import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CatalogBlock } from './CatalogBlock'
import { product } from './fixtures'

const many = (n: number) => Array.from({ length: n }, (_, i) => product({ externalId: `p${i}`, title: `Prod ${i}` }))

describe('CatalogBlock', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<CatalogBlock title="En AliExpress" state={{ status: 'idle', products: [] }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('loading shows 6 skeletons and the title', () => {
    const { container } = render(
      <CatalogBlock title="En AliExpress" note="Resultados de terceros" state={{ status: 'loading', products: [] }} />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'En AliExpress' })).toBeInTheDocument()
    expect(screen.getByText('Resultados de terceros')).toBeInTheDocument()
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(6)
  })

  it('error names the origin without the leading "En "', () => {
    render(<CatalogBlock title="En AliExpress" state={{ status: 'error', products: [] }} />)
    expect(screen.getByText('Ahora mismo no podemos buscar en AliExpress')).toBeInTheDocument()
  })

  it('ready and empty shows the message, or nothing with hideWhenEmpty', () => {
    const state = { status: 'ready' as const, products: [] }
    const { unmount } = render(<CatalogBlock title="En tiendas" state={state} />)
    expect(screen.getByText('No hemos encontrado nada en tiendas')).toBeInTheDocument()
    expect(screen.queryByText('Enlaces de afiliado')).toBeNull()
    unmount()
    const { container } = render(<CatalogBlock title="En tiendas" state={state} hideWhenEmpty />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ready renders cards capped at 12 by default and the affiliate footer', () => {
    render(<CatalogBlock title="En tiendas" state={{ status: 'ready', products: many(15) }} />)
    expect(screen.getAllByRole('link')).toHaveLength(12)
    expect(screen.getByText('Enlaces de afiliado')).toBeInTheDocument()
  })

  it('respects maxItems', () => {
    render(<CatalogBlock title="En tiendas" maxItems={3} state={{ status: 'ready', products: many(5) }} />)
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })
})
