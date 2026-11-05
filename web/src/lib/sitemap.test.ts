import { describe, expect, it } from 'vitest'
import { buildRobots, buildSitemap } from './sitemap'
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
    expect(entries.map((e) => e.url)).toEqual([
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

  it('returns at least the home when there is no data', () => {
    expect(buildSitemap([], [], SITE_URL).map((e) => e.url)).toEqual(['https://www.patobarato.com/'])
  })
})

describe('buildRobots', () => {
  it('allows everything except /go/ and /buscar and lists the sitemap', () => {
    const robots = buildRobots(SITE_URL)
    expect(robots.rules).toEqual({ userAgent: '*', allow: '/', disallow: ['/go/', '/buscar'] })
    expect(robots.sitemap).toBe('https://www.patobarato.com/sitemap.xml')
  })
})
