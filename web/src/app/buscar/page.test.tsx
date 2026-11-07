import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FilteredDealsPage, { generateMetadata } from './page'

describe('/buscar', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('renders the listing page (DealsClient), not the home', async () => {
    const { container } = render(await FilteredDealsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar chollos' })).toBeInTheDocument()
    expect(container.querySelector('section#como-funciona')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Últimos chollos' })).toBeNull()
  })

  it('uses the listing metadata: canonical /chollos, noindex with a search', async () => {
    const plain = await generateMetadata({ searchParams: Promise.resolve({}) })
    expect(plain.title).toBe('Chollos de hoy · PatoBarato')
    expect(plain.alternates?.canonical).toBe('/chollos')
    const search = await generateMetadata({ searchParams: Promise.resolve({ q: 'lego' }) })
    expect(search.robots).toEqual({ index: false, follow: true })
  })
})
