// The product description and category written by DeepSeek (or by hand in the admin).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProductView } from './components/ProductView'
import { categoryKey } from './lib/category-art'
import { fetchDeals } from './lib/deals'
import { FLAGS } from './lib/flags'
import { productJsonLd, productMetadata } from './lib/seo'
import type { Deal } from './lib/types'
import { fakeClient } from './test-utils/fakeClient'

const ABOUT = 'Una freidora de aire para cocinar con muy poco aceite, pensada para tres o cuatro personas.'

const row = (store: string, extra: Record<string, unknown> = {}) => ({
  publication_id: 1,
  published_at: '2026-12-01T10:00:00Z',
  price: '59.99',
  previous_price: '89.99',
  coupon: null,
  hashtags: ['tecnologia'],
  affiliate_url: 'https://www.amazon.es/dp/B0ABCDEF12?tag=patobarato-21',
  title: 'Cosori Freidora de aire 5,5 L',
  image_url: null,
  asin: 'B0ABCDEF12',
  country: 'ES',
  store,
  product_id: 1,
  discount_pct: 33,
  previous_min_price: null,
  is_lowest: false,
  price_before_coupon: false,
  slug: 'cosori-freidora-de-aire-5-5-l',
  description: ABOUT,
  category: 'hogar',
  ...extra,
})

async function dealFrom(store: string, extra?: Record<string, unknown>): Promise<Deal> {
  const { client } = fakeClient({ data: [row(store, extra)], error: null })
  return (await fetchDeals(client, { page: 0 })).deals[0]
}

describe('product description and category', () => {
  it('the assigned category wins over hashtags; «otros» and unknown values fall back to them', () => {
    expect(categoryKey(['tecnologia'], 'hogar')).toBe('hogar')
    expect(categoryKey(['tecnologia'], 'otros')).toBe('tecnologia')
    expect(categoryKey([], 'otros')).toBe('general')
    expect(categoryKey(['moda'], null)).toBe('moda')
  })

  it('deals carry the description and use the category for the Amazon illustration', async () => {
    const deal = await dealFrom('amazon')
    expect(deal.description).toBe(ABOUT)
    expect(deal.category).toBe('hogar')
    expect(deal.imageUrl).toBe('/categorias/hogar.jpeg')
    expect((await dealFrom('amazon', { description: '   ', category: null })).description).toBeNull()
  })

  it('the deal page shows the description under the title', async () => {
    render(<ProductView deal={await dealFrom('aliexpress')} related={[]} now="2026-12-01T12:00:00Z" />)
    expect(screen.getByTestId('product-description')).toHaveTextContent(ABOUT)
  })

  it('no description, no paragraph', async () => {
    render(<ProductView deal={await dealFrom('aliexpress', { description: null })} related={[]} now="2026-12-01T12:00:00Z" />)
    expect(screen.queryByTestId('product-description')).toBeNull()
  })

  it('the meta description uses it: alone when prices are hidden, after the price otherwise', async () => {
    FLAGS.amazonPrices = false
    const hidden = productMetadata(await dealFrom('amazon'), new Date('2026-12-01T12:00:00Z'))
    expect(hidden.description).toBe(ABOUT)
    const ali = productMetadata(await dealFrom('aliexpress'), new Date('2026-12-01T12:00:00Z'))
    expect(String(ali.description)).toMatch(/^Por 59,99\s€ \(antes 89,99\s€, -33%\) en AliExpress\. Una freidora/)
    expect(String(ali.description).length).toBeLessThanOrEqual(160)
  })

  it('structured data includes the description', async () => {
    expect(productJsonLd(await dealFrom('aliexpress'), 'https://www.patobarato.com/x')).toMatchObject({ description: ABOUT })
  })
})
