import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fetchDealByProduct } from '../../../../lib/deals'
import type { Deal } from '../../../../lib/types'
import { productPath } from '../../../../lib/urls'
import ProductPage from './page'

const deal: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:19:00Z',
  price: 13.9,
  previousPrice: 22.9,
  coupon: null,
  hashtags: ['hogar'],
  affiliateUrl: 'https://www.amazon.es/dp/B0ABCDEF12?tag=x-21',
  title: 'Cecotec Accesorios Freidora de aire',
  imageUrl: null,
  asin: 'B0ABCDEF12',
  country: 'es',
  store: 'amazon',
  productId: 7,
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
}

vi.mock('../../../../lib/supabase', () => ({ getSupabase: () => ({}) }))
vi.mock('../../../../lib/deals', () => ({
  fetchDealByProduct: vi.fn(async () => deal),
  fetchRelatedDeals: vi.fn(async () => {
    throw new Error('supabase down')
  }),
}))

describe('ProductPage', () => {
  it('still renders the product when the related deals fail to load', async () => {
    const slug = productPath(deal).split('/').pop()!
    const page = await ProductPage({ params: Promise.resolve({ store: 'amazon', slug }) })
    render(page)
    expect(screen.getByRole('heading', { level: 1, name: deal.title })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Más chollos/ })).not.toBeInTheDocument()
  })

  it('resolves a store without slug on its id and never redirects', async () => {
    const pc: Deal = { ...deal, store: 'pccomponentes', asin: 'ninja-af300-freidora-de-aire', affiliateUrl: 'https://www.pccomponentes.com/x' }
    vi.mocked(fetchDealByProduct).mockResolvedValueOnce(pc)
    const page = await ProductPage({
      params: Promise.resolve({ store: 'pccomponentes', slug: 'ninja-af300-freidora-de-aire' }),
    })
    render(page)
    expect(fetchDealByProduct).toHaveBeenLastCalledWith({}, 'pccomponentes', 'ninja-af300-freidora-de-aire')
    expect(screen.getByRole('link', { name: 'Ir a PcComponentes' })).toHaveAttribute('href', pc.affiliateUrl)
  })

  it('redirects 308 to the canonical URL when the AliExpress slug differs', async () => {
    const ali: Deal = { ...deal, store: 'aliexpress', asin: '1005006123456789', title: 'Auriculares Bluetooth' }
    vi.mocked(fetchDealByProduct).mockResolvedValueOnce(ali)
    const error = await ProductPage({
      params: Promise.resolve({ store: 'aliexpress', slug: 'x-1005006123456789' }),
    }).catch((e: unknown) => e)
    expect((error as { digest?: string }).digest).toBe(`NEXT_REDIRECT;replace;${productPath(ali)};308;`)
  })
})
