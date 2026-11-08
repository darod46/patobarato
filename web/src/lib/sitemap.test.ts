import { describe, expect, it } from 'vitest'
import { buildRobots, buildSitemap } from './sitemap'
import { siteEvent } from '../test-utils/siteEvent'
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
    expect(entries.map((e) => e.url).filter((u) => u.includes('/oferta/') || u.includes('/chollos') || u.endsWith('/buscar') || u.endsWith('.com/'))).toEqual([
      'https://www.patobarato.com/',
      'https://www.patobarato.com/chollos',
      'https://www.patobarato.com/buscar',
      'https://www.patobarato.com/oferta/amazon/freidora-de-aire-b0abcdef12',
      'https://www.patobarato.com/oferta/amazon/cafe-molido-b0zzzzzz99',
      'https://www.patobarato.com/chollos/hogar',
      `https://www.patobarato.com/chollos/${encodeURIComponent('cañas')}`,
    ])
  })

  it('uses publishedAt as lastModified for deals', () => {
    const entries = buildSitemap(deals, [], SITE_URL)
    expect(entries[3].lastModified).toEqual(new Date('2026-11-04T11:19:00Z'))
  })

  it('returns the home and the static pages when there is no data', () => {
    expect(buildSitemap([], [], SITE_URL).map((e) => e.url)).toEqual([
      'https://www.patobarato.com/',
      'https://www.patobarato.com/chollos',
      'https://www.patobarato.com/buscar',
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
      'https://www.patobarato.com/chollos',
      'https://www.patobarato.com/buscar',
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
  it('allows everything except /go/ (search URLs carry noindex) and lists the sitemap', () => {
    const robots = buildRobots(SITE_URL)
    expect(robots.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/go/'] })
    expect(robots.sitemap).toBe('https://www.patobarato.com/sitemap.xml')
  })
})

describe('buildSitemap events', () => {
  const now = new Date('2026-11-08T10:00:00Z')
  const soon = siteEvent({ slug: 'black-friday', name: 'Black Friday', startsOn: '2026-11-27', updatedAt: '2026-11-02T00:00:00Z' })
  const far = siteEvent({ slug: 'navidad', name: 'Navidad', startsOn: '2027-03-01' })
  const during = siteEvent({ slug: 'once', name: '11.11', startsOn: '2026-11-07', endsOn: '2026-11-09' })

  it('lists /eventos and each event with its priority', () => {
    const entries = buildSitemap([], [], SITE_URL, { coupons: false, events: [soon, far, during], now })
    const by = (u: string) => entries.find((e) => e.url === SITE_URL + u)
    expect(by('/eventos')).toMatchObject({ changeFrequency: 'weekly', priority: 0.7 })
    expect(by('/eventos/black-friday')).toMatchObject({ priority: 0.9, changeFrequency: 'weekly', lastModified: new Date('2026-11-02T00:00:00Z') })
    expect(by('/eventos/navidad')?.priority).toBe(0.6)
    expect(by('/eventos/once')?.priority).toBe(0.9)
  })

  it('omits /eventos without events', () => {
    const entries = buildSitemap([], [], SITE_URL, { coupons: false, events: [], now })
    expect(entries.some((e) => e.url.includes('/eventos'))).toBe(false)
  })
})
