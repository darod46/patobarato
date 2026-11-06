import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
})
