import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SearchPage, { generateMetadata } from './page'

describe('/buscar', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('renders the search page without server data', async () => {
    const { container } = render(await SearchPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Buscar' })).toBeInTheDocument()
    expect(screen.getAllByRole('search').at(-1)!).toBeInTheDocument()
    expect(container.querySelector('script[type="application/ld+json"]')?.textContent).toContain('Buscar')
  })

  it('shows the query from the URL as the heading', async () => {
    render(await SearchPage({ searchParams: Promise.resolve({ q: 'lego' }) }))
    expect(screen.getByRole('heading', { level: 1, name: 'Resultados para “lego”' })).toBeInTheDocument()
  })

  it('is indexable without a query and noindex with one, canonical /buscar', async () => {
    const plain = await generateMetadata({ searchParams: Promise.resolve({}) })
    expect(plain.alternates?.canonical).toBe('/buscar')
    expect(plain.robots).toBeUndefined()
    const search = await generateMetadata({ searchParams: Promise.resolve({ q: ['lego'] }) })
    expect(search.robots).toEqual({ index: false, follow: true })
  })
})
