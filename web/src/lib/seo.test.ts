import { describe, expect, it } from 'vitest'
import { formatPrice } from './format'
import { breadcrumbJsonLd, productJsonLd, productMetadata } from './seo'
import type { Deal } from './types'
import { SITE_URL, productPath } from './urls'

const deal: Deal = {
  publicationId: 1,
  publishedAt: '2026-11-04T11:19:00Z',
  price: 13.9,
  previousPrice: 22.9,
  coupon: 'Cupón 5 %',
  hashtags: ['hogar', 'cocina'],
  affiliateUrl: 'https://www.amazon.es/dp/B0ABCDEF12?tag=x-21',
  title: 'Cecotec Accesorios Freidora de aire',
  imageUrl: 'https://m.media-amazon.com/images/I/61kV8CO9K3L._AC_SL500_.jpg',
  asin: 'B0ABCDEF12',
  country: 'es',
  store: 'amazon',
  productId: 7,
}

const bare: Deal = { ...deal, previousPrice: null, coupon: null, hashtags: [], imageUrl: null }
const url = SITE_URL + productPath(deal)

describe('productJsonLd', () => {
  it('describes a full deal as a Product with an in-stock offer', () => {
    const ld = productJsonLd(deal, url) as Record<string, any>
    expect(ld['@context']).toBe('https://schema.org')
    expect(ld['@type']).toBe('Product')
    expect(ld.name).toBe(deal.title)
    expect(ld.image).toBe(deal.imageUrl)
    expect(ld.sku).toBe('B0ABCDEF12')
    expect(Number(ld.offers.price)).toBe(13.9)
    expect(ld.offers.priceCurrency).toBe('EUR')
    expect(ld.offers.availability).toBe('https://schema.org/InStock')
    expect(ld.offers.url).toBe(url)
    expect(ld.offers.seller.name).toBe('Amazon España')
  })

  it('omits absent fields instead of emitting null', () => {
    const ld = productJsonLd(bare, url) as Record<string, unknown>
    expect(ld).not.toHaveProperty('image')
    expect(JSON.stringify(ld)).not.toContain('null')
  })
})

describe('breadcrumbJsonLd', () => {
  it('lists the items in order with absolute URLs', () => {
    const ld = breadcrumbJsonLd([
      { name: 'Inicio', path: '/' },
      { name: '#hogar', path: '/chollos/hogar' },
      { name: deal.title, path: productPath(deal) },
    ]) as Record<string, any>
    expect(ld['@type']).toBe('BreadcrumbList')
    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: '#hogar', item: `${SITE_URL}/chollos/hogar` },
      { '@type': 'ListItem', position: 3, name: deal.title, item: url },
    ])
  })
})

describe('productMetadata', () => {
  it('builds title, description, canonical and Open Graph for a discounted deal', () => {
    const meta = productMetadata(deal)
    expect(meta.title).toBe(`${deal.title} por ${formatPrice(13.9)} (-39%) · PatoBarato`)
    expect(typeof meta.description).toBe('string')
    expect((meta.description as string).length).toBeLessThanOrEqual(160)
    expect(meta.description).toContain(formatPrice(22.9))
    expect(meta.description).toContain('Amazon España')
    expect(meta.description).toContain('Cupón 5 %')
    expect(meta.alternates?.canonical).toBe(productPath(deal))
    const images = meta.openGraph?.images as { url: string }[]
    expect(images[0].url).toBe(deal.imageUrl)
  })

  it('omits the discount without a previous price and keeps long descriptions short', () => {
    const long = { ...bare, title: 'Producto '.repeat(40).trim() }
    const meta = productMetadata(long)
    expect(meta.title).toBe(`${long.title} por ${formatPrice(13.9)} · PatoBarato`)
    expect((meta.description as string).length).toBeLessThanOrEqual(160)
    expect(meta.openGraph?.images).toBeUndefined()
  })
})
