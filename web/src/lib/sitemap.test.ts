import { describe, expect, it } from 'vitest'
import { buildRobots, buildSitemap } from './sitemap'
import type { GuideSummary } from './types'
import { SITE_URL } from './urls'

const deals = [
  { store: 'amazon', asin: 'B0ABCDEF12', title: 'Freidora de aire', publishedAt: '2026-11-04T11:19:00Z' },
  { store: 'amazon', asin: 'B0ZZZZZZ99', title: 'Café molido', publishedAt: '2026-11-03T08:00:00Z' },
]

describe('buildSitemap', () => {
  it('lists the home, every deal and only hashtags with at least 3 deals', () => {
    const entries = buildSitemap(
      deals,
      [
        { tag: 'hogar', count: 3 },
        { tag: 'poco', count: 2 },
        { tag: 'cañas', count: 10 },
      ],
      SITE_URL,
    )
    expect(entries.map((e) => e.url).filter((u) => u.includes('/oferta/') || u.includes('/chollos/') || u.endsWith('.com/'))).toEqual([
      'https://www.patobarato.com/',
      'https://www.patobarato.com/oferta/amazon/freidora-de-aire-b0abcdef12',
      'https://www.patobarato.com/oferta/amazon/cafe-molido-b0zzzzzz99',
      'https://www.patobarato.com/chollos/hogar',
      `https://www.patobarato.com/chollos/${encodeURIComponent('cañas')}`,
    ])
  })

  it('uses publishedAt as lastModified for deals', () => {
    const entries = buildSitemap(deals, [], SITE_URL)
    expect(entries[1].lastModified).toEqual(new Date('2026-11-04T11:19:00Z'))
  })

  it('returns the home and the static pages when there is no data', () => {
    expect(buildSitemap([], [], SITE_URL).map((e) => e.url)).toEqual([
      'https://www.patobarato.com/',
      'https://www.patobarato.com/aviso-legal',
      'https://www.patobarato.com/privacidad',
      'https://www.patobarato.com/cookies',
      'https://www.patobarato.com/afiliados',
      'https://www.patobarato.com/contacto',
    ])
  })

  it('adds /cupones only when there are coupons', () => {
    expect(buildSitemap([], [], SITE_URL, { coupons: true }).map((e) => e.url)).toContain('https://www.patobarato.com/cupones')
    expect(buildSitemap([], [], SITE_URL, { coupons: false }).map((e) => e.url)).not.toContain('https://www.patobarato.com/cupones')
  })
})

describe('buildSitemap stores', () => {
  const stores = [
    { store: 'amazon', deals: 10, coupons: 0 },
    { store: 'aliexpress', deals: 2, coupons: 1 },
  ]
  const urls = (s: typeof stores) => buildSitemap([], [], SITE_URL, { coupons: false, stores: s }).map((e) => e.url)

  it('adds /tiendas with two stores and a page only for stores with at least 3 deals', () => {
    expect(urls(stores)).toContain('https://www.patobarato.com/tiendas')
    expect(urls(stores)).toContain('https://www.patobarato.com/tiendas/amazon')
    expect(urls(stores)).not.toContain('https://www.patobarato.com/tiendas/aliexpress')
  })

  it('ignores unknown store ids', () => {
    const u = urls([...stores, { store: 'fnac', deals: 9, coupons: 0 }])
    expect(u.some((x) => x.includes('fnac'))).toBe(false)
    expect(urls([stores[0], { store: 'fnac', deals: 9, coupons: 0 }])).not.toContain('https://www.patobarato.com/tiendas')
  })

  it('omits /tiendas with a single store but keeps its page when indexable', () => {
    expect(urls([stores[0]])).not.toContain('https://www.patobarato.com/tiendas')
    expect(urls([stores[0]])).toContain('https://www.patobarato.com/tiendas/amazon')
  })
})

const guide = (slug: string, updatedAt: string): GuideSummary => ({
  slug,
  title: slug,
  subtitle: null,
  category: 'Hogar',
  author: 'el Pato',
  readingMinutes: 5,
  publishedAt: '2026-11-01T10:00:00Z',
  updatedAt,
  items: 3,
  pricesCheckedAt: null,
})

describe('buildSitemap guides', () => {
  it('adds nothing for guides when there are none', () => {
    const u = buildSitemap([], [], SITE_URL, { coupons: false, guides: [] }).map((e) => e.url)
    expect(u).not.toContain('https://www.patobarato.com/guias')
    expect(u.some((x) => x.includes('/guias/'))).toBe(false)
  })

  it('lists /guias and one entry per guide with lastModified = updatedAt, after the stores and before the deals', () => {
    const entries = buildSitemap(deals, [], SITE_URL, {
      coupons: false,
      stores: [{ store: 'amazon', deals: 10, coupons: 0 }],
      guides: [guide('freidoras-de-aire-menos-100', '2026-11-06T09:00:00Z'), guide('cafeteras', '2026-11-07T08:00:00Z')],
    })
    const urls = entries.map((e) => e.url)
    const guideEntries = entries.filter((e) => e.url.includes('/guias/'))
    expect(guideEntries.map((e) => e.lastModified)).toEqual([
      new Date('2026-11-06T09:00:00Z'),
      new Date('2026-11-07T08:00:00Z'),
    ])
    expect(urls.indexOf('https://www.patobarato.com/guias')).toBeGreaterThan(urls.indexOf('https://www.patobarato.com/tiendas/amazon'))
    expect(urls.indexOf('https://www.patobarato.com/guias/cafeteras')).toBeLessThan(urls.indexOf(SITE_URL + '/oferta/amazon/freidora-de-aire-b0abcdef12'))
  })

  it('returns the same entries when guides are omitted', () => {
    expect(buildSitemap(deals, [], SITE_URL, { coupons: false }).map((e) => e.url)).toEqual([
      'https://www.patobarato.com/',
      'https://www.patobarato.com/oferta/amazon/freidora-de-aire-b0abcdef12',
      'https://www.patobarato.com/oferta/amazon/cafe-molido-b0zzzzzz99',
      'https://www.patobarato.com/aviso-legal',
      'https://www.patobarato.com/privacidad',
      'https://www.patobarato.com/cookies',
      'https://www.patobarato.com/afiliados',
      'https://www.patobarato.com/contacto',
    ])
  })
})

describe('buildRobots', () => {
  it('allows everything except /go/ and /buscar and lists the sitemap', () => {
    const robots = buildRobots(SITE_URL)
    expect(robots.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/go/', '/buscar'] })
    expect(robots.sitemap).toBe('https://www.patobarato.com/sitemap.xml')
  })
})
