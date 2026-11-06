import { describe, expect, it } from 'vitest'
import { formatPrice } from './format'
import { OG_IMAGE, breadcrumbJsonLd, couponsMetadata, hashtagMetadata, homeMetadata, productJsonLd, productMetadata, siteJsonLd, storeMetadata, storesMetadata, jsonLdScript } from './seo'
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
  discountPct: null,
  previousMinPrice: null,
  isLowest: false,
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
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: [deal.imageUrl] })
  })

  it('omits the discount without a previous price and keeps long descriptions short', () => {
    const long = { ...bare, title: 'Producto '.repeat(40).trim() }
    const meta = productMetadata(long)
    expect(meta.title).toBe(`${long.title} por ${formatPrice(13.9)} · PatoBarato`)
    expect((meta.description as string).length).toBeLessThanOrEqual(160)
  })

  it('falls back to the default Open Graph image when the deal has no image', () => {
    const meta = productMetadata(bare)
    expect(meta.openGraph?.images).toEqual([OG_IMAGE])
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: ['/og.png'] })
  })
})

describe('hashtagMetadata', () => {
  it('builds title, description and canonical, indexable from 3 deals', () => {
    const meta = hashtagMetadata('hogar', 3)
    expect(meta.title).toBe('Chollos de hogar · PatoBarato')
    expect(meta.description).toContain('hogar')
    expect(meta.alternates?.canonical).toBe('/chollos/hogar')
    expect(meta.openGraph?.url).toBe('/chollos/hogar')
    expect(meta.robots).toBeUndefined()
  })

  it('is noindex below 3 deals and encodes the canonical', () => {
    const meta = hashtagMetadata('niños', 2)
    expect(meta.title).toBe('Chollos de niños · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/chollos/ni%C3%B1os')
    expect(meta.robots).toEqual({ index: false, follow: true })
  })

  it('keeps the default Open Graph image', () => {
    const meta = hashtagMetadata('hogar', 3)
    expect(OG_IMAGE).toEqual({ url: '/og.png', width: 1200, height: 630, alt: 'PatoBarato · El pato que caza los chollos de Amazon antes de que vuelen' })
    expect(meta.openGraph?.images).toEqual([OG_IMAGE])
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: ['/og.png'] })
  })
})

describe('homeMetadata', () => {
  it('has no extra metadata without filters', () => {
    expect(homeMetadata({})).toEqual({ alternates: { canonical: '/' } })
  })

  it('points ?tag= to the hashtag page', () => {
    expect(homeMetadata({ tag: 'Hogar' }).alternates?.canonical).toBe('/chollos/hogar')
    expect(homeMetadata({ tag: 'niños' }).alternates?.canonical).toBe('/chollos/ni%C3%B1os')
  })

  it('ignores an invalid tag', () => {
    expect(homeMetadata({ tag: 'a b<' }).alternates?.canonical).toBe('/')
  })

  it('marks searches noindex', () => {
    expect(homeMetadata({ q: 'lego' }).robots).toEqual({ index: false, follow: true })
    expect(homeMetadata({ q: 'lego', tag: 'hogar' }).robots).toEqual({ index: false, follow: true })
    expect(homeMetadata({ q: '' }).robots).toBeUndefined()
  })
})

describe('siteJsonLd', () => {
  it('describes the WebSite with a search action and the Organization with an absolute logo', () => {
    const [site, org] = siteJsonLd() as any[]
    expect(site['@type']).toBe('WebSite')
    expect(site.url).toBe(SITE_URL)
    expect(site.potentialAction['@type']).toBe('SearchAction')
    expect(site.potentialAction.target).toBe(`${SITE_URL}/?q={search_term_string}`)
    expect(site.potentialAction['query-input']).toBe('required name=search_term_string')
    expect(org['@type']).toBe('Organization')
    expect(org.name).toBe('PatoBarato')
    expect(org.logo).toBe(`${SITE_URL}/logo.svg`)
  })
})

describe('jsonLdScript', () => {
  it('escapes < so a title cannot close the script element, and still round-trips', () => {
    const title = '</script><script>alert(1)</script>'
    const { __html } = jsonLdScript({ t: title })
    expect(__html).not.toContain('<')
    expect(__html).toContain('\\u003c')
    expect(JSON.parse(__html)).toEqual({ t: title })
  })
})

describe('homeMetadata with coupons', () => {
  it('mentions coupons and other stores only when present', () => {
    expect(homeMetadata({}).title).toBeUndefined()
    expect(homeMetadata({ stores: ['amazon'] }).title).toBe('PatoBarato · Chollos y cupones de Amazon')
    expect(homeMetadata({ stores: ['aliexpress'] }).title).toBe('PatoBarato · Chollos y cupones de Amazon y otras tiendas')
  })
})

describe('couponsMetadata', () => {
  it('is indexable only with coupons', () => {
    expect(couponsMetadata(3)).toMatchObject({ title: 'Cupones vigentes · PatoBarato', alternates: { canonical: '/cupones' } })
    expect(couponsMetadata(3).robots).toBeUndefined()
    expect(couponsMetadata(0).robots).toEqual({ index: false, follow: true })
  })
})

describe('storeMetadata', () => {
  it('titles, canonicalizes and indexes a store with 3 deals', () => {
    const meta = storeMetadata('aliexpress', 3)
    expect(meta.title).toBe('Chollos de AliExpress · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/tiendas/aliexpress')
    expect(meta.openGraph?.images).toEqual([OG_IMAGE])
    expect(meta.robots).toBeUndefined()
  })

  it('is noindex below 3 deals', () => {
    expect(storeMetadata('aliexpress', 2).robots).toEqual({ index: false, follow: true })
  })
})

describe('storesMetadata', () => {
  it('is noindex below two stores', () => {
    expect(storesMetadata(1).robots).toEqual({ index: false, follow: true })
    expect(storesMetadata(2).robots).toBeUndefined()
    expect(storesMetadata(2).title).toBe('Tiendas · PatoBarato')
    expect(storesMetadata(2).alternates?.canonical).toBe('/tiendas')
  })
})
