import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as deals from '../../lib/deals'
import DealsPage, * as pageModule from './page'
import { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn().mockResolvedValue([]) }))
vi.mock('../../lib/deals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/deals')>()),
  fetchDeals: vi.fn(),
  fetchHashtags: vi.fn().mockResolvedValue([]),
}))


describe('/chollos', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    history.replaceState(null, '', '/')
  })

  it('is dynamic: it reads the filters per request', () => {
    expect(pageModule).not.toHaveProperty('revalidate')
  })

  it('fetches page 0 with the validated tag, order and store and hands it to the client', async () => {
    const fetchDeals = vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    history.replaceState(null, '', '/chollos?tag=lego&orden=minimo&tienda=aliexpress')
    render(await DealsPage({ searchParams: Promise.resolve({ tag: 'LEGO', orden: 'minimo', tienda: 'aliexpress' }) }))
    expect(fetchDeals).toHaveBeenCalledWith({}, { page: 0, tag: 'lego', store: 'aliexpress', sort: 'minimo' })
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
    // The server page is already there: the client did not need to fetch anything.
    expect(fetchDeals).toHaveBeenCalledTimes(1)
  })

  it('ignores malformed filters and uses the first value of a repeated one', async () => {
    const fetchDeals = vi.mocked(deals.fetchDeals).mockResolvedValue({ deals: [], hasMore: false })
    render(await DealsPage({ searchParams: Promise.resolve({ tag: ['a}', 'b'], orden: 'xyz', tienda: 'a b' }) }))
    expect(fetchDeals).toHaveBeenCalledWith({}, { page: 0, tag: undefined, store: undefined, sort: 'recientes' })
  })

  it('keeps a legacy ?tag= canonical to the tag page', async () => {
    const meta = await generateMetadata({ searchParams: Promise.resolve({ tag: 'Hogar' }) })
    expect(meta.alternates?.canonical).toBe('/chollos/hogar')
  })

  it('has the fixed title and a canonical on /chollos, also without data', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('Chollos de hoy · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/chollos')
    expect(meta.robots).toBeUndefined()
  })

  it('renders the listing page and the breadcrumb even when the server fetch fails', async () => {
    vi.mocked(deals.fetchDeals).mockRejectedValue(new Error('down'))
    const { container } = render(await DealsPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Chollos de hoy' })).toBeInTheDocument()
    const ld = JSON.parse(container.querySelector('script[type="application/ld+json"]')!.textContent!)
    expect(ld.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Inicio', 'Chollos'])
    expect(ld.itemListElement[1].item).toMatch(/\/chollos$/)
  })
})
