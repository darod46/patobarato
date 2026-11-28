// Products followed by the @patobaratobot price alerts without a publication: a page, but no deal.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProductView } from './components/ProductView'
import { fetchDealByProduct, isDealIndexable } from './lib/deals'
import { productMetadata } from './lib/seo'

const tracked = {
  publication_id: null,
  published_at: '2026-11-28T10:00:00Z',
  price: '24.90',
  previous_price: null,
  coupon: null,
  hashtags: [],
  affiliate_url: 'https://s.click.aliexpress.com/e/x',
  title: 'Lámpara LED',
  image_url: null,
  asin: '1005000000000001',
  country: 'ES',
  store: 'aliexpress',
  product_id: 5,
  discount_pct: null,
  previous_min_price: null,
  is_lowest: false,
  price_before_coupon: false,
  status: 'active',
  ended_at: null,
  slug: 'lampara-led',
}

function client(tables: Record<string, unknown[] | 'error'>) {
  const calls: string[] = []
  return {
    calls,
    from(table: string) {
      calls.push(table)
      const result = tables[table] === 'error' ? { data: null, error: { message: 'no view' } } : { data: tables[table] ?? [], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q
      q.then = (r: (v: unknown) => void) => r(result)
      return q
    },
  }
}

describe('tracked products', () => {
  it('falls back to web_tracked_pages when the product has no publication', async () => {
    const c = client({ web_deal_pages: [], web_tracked_pages: [tracked] })
    // oxlint-disable-next-line no-explicit-any
    const deal = await fetchDealByProduct(c as any, 'aliexpress', '1005000000000001')
    expect(c.calls).toEqual(['web_deal_pages', 'web_tracked_pages'])
    expect(deal).toMatchObject({ tracked: true, price: 24.9, title: 'Lámpara LED', status: 'active' })
    expect(isDealIndexable(deal!, new Date('2026-11-28T12:00:00Z'))).toBe(false)
    expect(productMetadata(deal!, new Date('2026-11-28T12:00:00Z')).robots).toBeTruthy()
  })

  it('a missing view is a not found, never an error', async () => {
    // oxlint-disable-next-line no-explicit-any
    expect(await fetchDealByProduct(client({ web_deal_pages: [], web_tracked_pages: 'error' }) as any, 'aliexpress', '1')).toBeNull()
  })

  it('the page shows no publication date', async () => {
    const c = client({ web_deal_pages: [], web_tracked_pages: [tracked] })
    // oxlint-disable-next-line no-explicit-any
    const deal = (await fetchDealByProduct(c as any, 'aliexpress', '1005000000000001'))!
    render(<ProductView deal={deal} related={[]} now="2026-11-28T12:00:00Z" />)
    expect(screen.queryByText(/Publicado/)).toBeNull()
    expect(screen.getByText('El precio puede cambiar')).toBeInTheDocument()
  })
})
