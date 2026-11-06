import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStores } from '../../lib/stores-data'
import StoresPage, { generateMetadata } from './page'

vi.mock('../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../lib/stores-data', () => ({ fetchStores: vi.fn() }))

beforeEach(() => {
  vi.mocked(fetchStores).mockReset()
})

describe('StoresPage', () => {
  it('lists the stores with data and links each one, even with a single store', async () => {
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'aliexpress', deals: 1, coupons: 2 }])
    render(await StoresPage())
    expect(screen.getByRole('link', { name: /AliExpress/ })).toHaveAttribute('href', '/tiendas/aliexpress')
    expect(screen.getByText('1 chollo · 2 cupones')).toBeInTheDocument()
  })

  it('shows an honest empty state when the stores cannot be loaded', async () => {
    vi.mocked(fetchStores).mockImplementation(async () => {
      throw new Error('down')
    })
    render(await StoresPage())
    expect(screen.getByText('Ahora mismo no podemos cargar las tiendas.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /AliExpress/ })).not.toBeInTheDocument()
  })

  it('is noindex unless more than one store has data', async () => {
    vi.mocked(fetchStores).mockResolvedValue([{ store: 'amazon', deals: 4, coupons: 0 }])
    expect((await generateMetadata()).robots).toEqual({ index: false, follow: true })
    vi.mocked(fetchStores).mockResolvedValue([
      { store: 'amazon', deals: 4, coupons: 0 },
      { store: 'aliexpress', deals: 1, coupons: 0 },
    ])
    expect((await generateMetadata()).robots).toBeUndefined()
  })
})
