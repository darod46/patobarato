import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPageCopy } from '../../lib/page-copy'
import { fetchStores } from '../../lib/stores-data'
import type { PageCopy } from '../../lib/types'
import StoresPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn() }))
vi.mock('../../lib/page-copy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/page-copy')>()),
  fetchPageCopy: vi.fn(),
}))

const copy: PageCopy = {
  kind: 'static',
  slug: 'tiendas',
  title: 'Tiendas con chollos: Amazon y AliExpress',
  h1: 'Las tiendas que sigue el pato',
  introMd: 'Elegimos las tiendas por sus ofertas.\n\nHoy hay {deals} chollos activos en {stores}.',
  faq: [],
  updatedAt: '2026-11-20T10:00:00Z',
}

const down = async () => {
  throw new Error('down')
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(fetchStores).mockReset()
  vi.mocked(fetchPageCopy).mockReset().mockResolvedValue(null)
})

describe('StoresPage', () => {
  it('lists the stores with data and links each one, even with a single store', async () => {
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'aliexpress', deals: 1, coupons: 2 }])
    render(await StoresPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Tiendas con chollos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AliExpress/ })).toHaveAttribute('href', '/tiendas/aliexpress')
    expect(screen.getByText('1 chollo · 2 cupones')).toBeInTheDocument()
  })

  it('is indexable with a single store and with none', async () => {
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'amazon', deals: 4, coupons: 0 }])
    expect((await generateMetadata()).robots).toBeUndefined()
    vi.mocked(fetchStores).mockResolvedValue([])
    const meta = await generateMetadata()
    expect(meta.robots).toBeUndefined()
    expect(meta.title).toBe('Tiendas con chollos · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/tiendas')
  })

  it('with an empty list keeps the copy h1 and the honest empty state, without counts', async () => {
    vi.mocked(fetchStores).mockResolvedValue([])
    vi.mocked(fetchPageCopy).mockResolvedValue(copy)
    expect((await generateMetadata()).robots).toBeUndefined()
    render(await StoresPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Las tiendas que sigue el pato' })).toBeInTheDocument()
    expect(screen.getByText('Elegimos las tiendas por sus ofertas.')).toBeInTheDocument()
    expect(screen.getByText('Todavía no hay chollos ni cupones activos de ninguna tienda.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\{deals\}|\{stores\}|Hoy hay/)
  })

  it('fills the live totals into the copy and uses its title', async () => {
    vi.mocked(fetchStores).mockResolvedValue([
      { store: 'amazon', deals: 40, coupons: 0 },
      { store: 'aliexpress', deals: 2, coupons: 1 },
      { store: 'pccomponentes', deals: 0, coupons: 3 },
    ])
    vi.mocked(fetchPageCopy).mockResolvedValue(copy)
    expect((await generateMetadata()).title).toBe('Tiendas con chollos: Amazon y AliExpress · PatoBarato')
    render(await StoresPage())
    expect(screen.getByText('Hoy hay 42 chollos activos en Amazon y AliExpress.')).toBeInTheDocument()
  })

  it('treats a failed copy read as no copy', async () => {
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'amazon', deals: 4, coupons: 0 }])
    vi.mocked(fetchPageCopy).mockImplementation(down)
    render(await StoresPage())
    expect(screen.getByRole('heading', { level: 1, name: 'Tiendas con chollos' })).toBeInTheDocument()
  })

  it('rejects (never an empty indexable page) when the stores read fails', async () => {
    vi.mocked(fetchStores).mockImplementation(down)
    await expect(StoresPage()).rejects.toThrow('down')
    await expect(generateMetadata()).rejects.toThrow('down')
  })
})
