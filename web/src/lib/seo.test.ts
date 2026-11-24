import { describe, expect, it } from 'vitest'
import { formatPrice } from './format'
import { storeInfo } from './stores'
import { siteEvent } from '../test-utils/siteEvent'
import { OG_IMAGE, aboutJsonLd, legalMetadata, listingMetadata, withHreflang, breadcrumbJsonLd, eventJsonLd, eventMetadata, faqJsonLd, guideJsonLd, guideMetadata, searchMetadata, homeMetadata, productJsonLd, productMetadata, siteJsonLd, jsonLdScript } from './seo'
import type { Deal, Guide } from './types'
import { SITE_URL, productPath } from './urls'

const deal: Deal = {
  publicationId: 1, status: 'active', endedAt: null,
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
  priceBeforeCoupon: false,
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

  it('says the price is before the coupon in title and description', () => {
    const meta = productMetadata({ ...deal, previousPrice: null, coupon: 'AEES03', priceBeforeCoupon: true })
    expect(meta.title).toBe(`${deal.title} por ${formatPrice(13.9)} sin cupón · PatoBarato`)
    expect(meta.description).toContain(`por ${formatPrice(13.9)} sin cupón`)
    expect(meta.description).toContain('AEES03')
  })

  it('does not mention the coupon for a plain price', () => {
    const meta = productMetadata(deal)
    expect(meta.title).not.toContain('sin cupón')
    expect(meta.description).not.toContain('sin cupón')
  })

  it('falls back to the default Open Graph image when the deal has no image', () => {
    const meta = productMetadata(bare)
    expect(meta.openGraph?.images).toEqual([OG_IMAGE])
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: ['/og.png'] })
  })
})

describe('homeMetadata', () => {
  it('has only the canonical without stores', () => {
    expect(homeMetadata({})).toEqual({ alternates: withHreflang('/') })
  })
})

describe('siteJsonLd', () => {
  it('describes the WebSite with a search action and the Organization with an absolute logo', () => {
    const [site, org] = siteJsonLd() as any[]
    expect(site['@type']).toBe('WebSite')
    expect(site.url).toBe(SITE_URL)
    expect(site.potentialAction['@type']).toBe('SearchAction')
    expect(site.potentialAction.target).toBe(`${SITE_URL}/buscar?q={search_term_string}`)
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

describe('homeMetadata with stores', () => {
  const st = (store: string, deals: number, coupons: number) => ({ store, deals, coupons })
  it('mentions coupons and other stores only when the data shows them', () => {
    expect(homeMetadata({}).title).toBeUndefined()
    expect(homeMetadata({ stores: [st('amazon', 5, 0)] }).title).toBe('PatoBarato · Chollos de Amazon')
    expect(homeMetadata({ stores: [st('amazon', 5, 2)] }).title).toBe('PatoBarato · Chollos y cupones de Amazon')
    expect(homeMetadata({ stores: [st('amazon', 5, 0), st('aliexpress', 2, 0)] }).title).toBe('PatoBarato · Chollos de Amazon y otras tiendas')
    expect(homeMetadata({ stores: [st('aliexpress', 0, 3)] }).title).toBe('PatoBarato · Chollos y cupones de Amazon y otras tiendas')
    expect(homeMetadata({ stores: [st('amazon', 5, 0)] }).description).not.toContain('cupones')
  })
})

const guide: Guide = {
  slug: 'freidoras',
  title: 'Las mejores freidoras',
  subtitle: null,
  category: 'Hogar',
  author: 'Ana',
  readingMinutes: 8,
  publishedAt: '2026-11-01T10:00:00Z',
  updatedAt: '2026-11-06T10:00:00Z',
  pricesCheckedAt: null,
  introMd: 'Elegir **bien** importa. Segunda frase.',
  howToChooseMd: '',
  faq: [
    { q: '¿Una?', aMd: 'Sí **claro**' },
    { q: '¿Dos?', aMd: 'No' },
  ],
  items: [
    { id: 1, position: 1, name: 'Ninja', award: null, summaryMd: '', pros: [], cons: [], specs: [], imageUrl: null, stores: [] },
    { id: 2, position: 2, name: 'Cosori', award: null, summaryMd: '', pros: [], cons: [], specs: [], imageUrl: null, stores: [] },
  ],
}

describe('guideMetadata', () => {
  it('builds title, description from the intro and canonical', () => {
    const m = guideMetadata(guide, true)
    expect(m.title).toBe('Las mejores freidoras · Guías PatoBarato')
    expect(m.description).toBe('Elegir bien importa.')
    expect(m.alternates?.canonical).toBe('/guias/freidoras')
    expect(m.robots).toBeUndefined()
  })
  it('prefers the subtitle and is noindex when not indexable', () => {
    const m = guideMetadata({ ...guide, subtitle: 'Sub' }, false)
    expect(m.description).toBe('Sub')
    expect(m.robots).toEqual({ index: false, follow: true })
  })
  it('truncates a long subtitle to the description limit', () => {
    const long =
      'Hemos comparado Ninja, Cosori, Cecotec y Ufesa por capacidad, ruido, limpieza y precio real en las últimas semanas. Estas son las que de verdad merecen la pena, con precios revisados y cupones.'
    const m = guideMetadata({ ...guide, subtitle: long }, true)
    expect(long.length).toBeGreaterThan(160)
    expect((m.description ?? '').length).toBeLessThanOrEqual(160)
    expect(m.description).toMatch(/…$/)
    expect(m.openGraph?.description).toBe(m.description)
  })
})

describe('guideJsonLd', () => {
  it('returns Article, ItemList and FAQPage', () => {
    const url = `${SITE_URL}/guias/freidoras`
    const [article, list, faq] = guideJsonLd(guide, url) as Record<string, any>[]
    expect(article['@type']).toBe('Article')
    expect(article.author).toEqual({ '@type': 'Organization', name: 'PatoBarato' })
    expect(article.mainEntityOfPage).toBe(url)
    expect(list['@type']).toBe('ItemList')
    expect(list.itemListElement[1]).toMatchObject({ '@type': 'ListItem', position: 2, name: 'Cosori', url: `${url}#producto-2` })
    expect(faq['@type']).toBe('FAQPage')
    expect(faq.mainEntity).toHaveLength(2)
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe('Sí claro')
  })
  it('omits FAQPage without questions', () => {
    expect(guideJsonLd({ ...guide, faq: [] }, 'u')).toHaveLength(2)
  })
})

describe('searchMetadata', () => {
  it('is canonical on /buscar and indexable without a query', () => {
    const meta = searchMetadata(null)
    expect(meta.title).toBe('Buscar chollos · PatoBarato')
    expect(meta.alternates?.canonical).toBe('/buscar')
    expect(meta.robots).toBeUndefined()
  })

  it('is noindex with a query', () => {
    expect(searchMetadata('freidora').robots).toEqual({ index: false, follow: true })
    expect(searchMetadata('  ').robots).toBeUndefined()
  })
})

describe('event SEO', () => {
  const bf = siteEvent({
    slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29',
    introMd: 'El **Black Friday** llega con rebajas. Segunda frase.',
  })
  const prime = siteEvent({ slug: 'prime-day', name: 'Prime Day', startsOn: '2026-07-01', approximate: true })

  it('builds the event metadata', () => {
    const m = eventMetadata(bf)
    expect(m.title).toBe('Black Friday 2026: chollos, cupones y consejos | PatoBarato')
    expect(m.description).toBe('El Black Friday llega con rebajas.')
    expect(m.alternates).toEqual(withHreflang('/eventos/black-friday'))
    expect(m.openGraph).toMatchObject({ type: 'website', images: [OG_IMAGE] })
    expect(m.robots).toBeUndefined()
  })

  it('has no Event JSON-LD for approximate dates', () => {
    expect(eventJsonLd(prime, `${SITE_URL}/eventos/prime-day`)).toBeNull()
  })

  it('builds Event JSON-LD with exact dates', () => {
    const url = `${SITE_URL}/eventos/black-friday`
    expect(eventJsonLd(bf, url)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: 'Black Friday 2026',
      startDate: '2026-11-27',
      endDate: '2026-11-29',
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
      location: { '@type': 'VirtualLocation', url },
      organizer: { '@type': 'Organization', name: 'PatoBarato', url: SITE_URL },
      description: 'El Black Friday llega con rebajas.',
    })
  })

  it('builds FAQPage JSON-LD', () => {
    expect(faqJsonLd([{ q: '¿Cuándo?', aMd: 'El **viernes**.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: '¿Cuándo?', acceptedAnswer: { '@type': 'Answer', text: 'El viernes.' } }],
    })
  })
})

describe('withHreflang', () => {
  it('points every language at the same path', () => {
    expect(withHreflang('/chollos/hogar')).toEqual({
      canonical: '/chollos/hogar',
      languages: { 'es-ES': '/chollos/hogar', 'x-default': '/chollos/hogar' },
    })
  })
})

describe('listingMetadata', () => {
  const copy = {
    kind: 'category' as const, slug: 'hogar', title: 'Chollos de hogar con copy', h1: 'H1',
    introMd: 'Hay **{deals}** chollos de hogar. Segunda frase.', faq: [], updatedAt: '2026-11-22T00:00:00Z',
  }
  const base = { kind: 'category' as const, slug: 'hogar', path: '/chollos/hogar', values: { deals: 12 }, indexable: true }

  it('uses the copy title and the first rendered sentence as description', () => {
    const m = listingMetadata({ ...base, copy })
    expect(m.title).toBe('Chollos de hogar con copy · PatoBarato')
    expect(m.description).toBe('Hay 12 chollos de hogar.')
    expect(m.openGraph).toMatchObject({ url: '/chollos/hogar', title: m.title, description: m.description })
  })

  it('falls back to the default title with the suffix and the fallback description', () => {
    const m = listingMetadata({ ...base, copy: null, fallbackDescription: 'Descripción por defecto.' })
    expect(m.title).toBe('Chollos de hogar: 12 ofertas hoy · PatoBarato')
    expect(m.description).toBe('Descripción por defecto.')
  })

  it('drops the marker sentence when the value is unavailable', () => {
    const m = listingMetadata({ ...base, values: {}, copy: { ...copy, introMd: 'Hay {deals} chollos. Segunda frase.' } })
    expect(m.description).toBe('Segunda frase.')
  })

  it('falls back when the rendered copy description is empty', () => {
    const empty = { ...copy, introMd: 'Hay {deals} chollos.' }
    expect(listingMetadata({ ...base, values: {}, copy: empty, fallbackDescription: 'Respaldo.' }).description).toBe('Respaldo.')
    expect(listingMetadata({ ...base, values: {}, copy: empty }).description).toMatch(/^Los últimos chollos cazados/)
  })

  it('is noindex only when not indexable', () => {
    expect(listingMetadata({ ...base, copy: null }).robots).toBeUndefined()
    expect(listingMetadata({ ...base, copy: null, indexable: false }).robots).toEqual({ index: false, follow: true })
  })

  it('adds hreflang alternates', () => {
    expect(listingMetadata({ ...base, copy: null }).alternates?.languages?.['es-ES']).toBe('/chollos/hogar')
  })
})

describe('hreflang on every metadata helper', () => {
  it('has alternates.languages', () => {
    const metas = [
      productMetadata(deal),
      guideMetadata(guide, true),
      eventMetadata(siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', endsOn: '2026-11-29', introMd: 'Hola.' })),
      searchMetadata(null),
      legalMetadata('Aviso', '/aviso-legal', 'Texto.'),
      homeMetadata({}),
    ]
    for (const m of metas) {
      const path = m.alternates?.canonical as string
      expect(m.alternates?.languages).toEqual({ 'es-ES': path, 'x-default': path })
    }
  })
})

describe('aboutJsonLd', () => {
  it('returns AboutPage and Organization', () => {
    const data = aboutJsonLd('https://www.patobarato.com/sobre-nosotros')
    expect(data.map((d) => d['@type'])).toEqual(['AboutPage', 'Organization'])
    expect(data[1]).toMatchObject({ name: 'PatoBarato', sameAs: ['https://t.me/patobarato'] })
  })
})

describe('ended deals', () => {
  const ended: Deal = { ...deal, status: 'ended', endedAt: '2026-11-23T10:00:00Z', publishedAt: '2026-11-20T10:00:00Z' }
  const now = new Date('2026-11-24T10:00:00Z')

  it('keeps the active metadata and no robots', () => {
    const meta = productMetadata(deal, now)
    expect(meta.title).toContain('por 13,90')
    expect(meta.robots).toBeUndefined()
  })

  it('titles and describes a recently ended deal and keeps it indexable', () => {
    const meta = productMetadata(ended, now)
    expect(meta.title).toBe(`${ended.title} · Oferta caducada · PatoBarato`)
    expect(meta.description).toBe(
      `Esta oferta de ${storeInfo('amazon').name} ya ha terminado. Se publicó a ${formatPrice(ended.price)} el 20 de noviembre. Mira el precio actual o las ofertas vigentes.`,
    )
    expect(meta.robots).toBeUndefined()
  })

  it('marks an old ended deal noindex', () => {
    const old: Deal = { ...ended, endedAt: '2026-01-01T10:00:00Z' }
    expect(productMetadata(old, now).robots).toEqual({ index: false, follow: true })
  })

  it('declares SoldOut and priceValidUntil in the JSON-LD', () => {
    const ld = productJsonLd(ended, url) as Record<string, any>
    expect(ld.offers.availability).toBe('https://schema.org/SoldOut')
    expect(ld.offers.priceValidUntil).toBe('2026-11-23')
    const active = productJsonLd(deal, url) as Record<string, any>
    expect(active.offers.priceValidUntil).toBeUndefined()
  })
})
